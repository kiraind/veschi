#!/bin/sh
# Smoke test of a built image against an empty PostgreSQL and an empty MinIO:
# the container must apply migrations, create the bucket and the first user,
# answer on its port, guard pages and APIs, and not duplicate the user on restart.
#
# Usage: docker/smoke-test.sh <image>   (env: SMOKE_PORT, default 3000; MINIO_IMAGE)
set -eu

IMAGE=${1:?usage: $0 <image>}
PORT=${SMOKE_PORT:-3000}
MINIO_IMAGE=${MINIO_IMAGE:-bitnamilegacy/minio:2025.7.23-debian-12-r5}
BASE=http://localhost:$PORT
NET=veschi-smoke
COOKIES=$(mktemp)

cleanup() {
	status=$?
	if [ "$status" -ne 0 ]; then
		echo '--- app logs ---'
		docker logs veschi-smoke-app 2>&1 | tail -50 || true
	fi
	docker rm -f veschi-smoke-app veschi-smoke-pg veschi-smoke-minio >/dev/null 2>&1 || true
	docker network rm "$NET" >/dev/null 2>&1 || true
	rm -f "$COOKIES"
	exit "$status"
}
trap cleanup EXIT

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

# Retries a command once a second for up to $1 seconds.
retry() {
	seconds=$1
	shift
	i=0
	until "$@" >/dev/null 2>&1; do
		i=$((i + 1))
		[ "$i" -lt "$seconds" ] || return 1
		sleep 1
	done
}

# Prints the HTTP status and Location header of a request: "<status> <location>".
http() {
	curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$@"
}

# HTTP status of a signed HEAD request for the bucket: 200 exists, 404 missing.
bucket_status() {
	curl -s -o /dev/null -w '%{http_code}' -I --aws-sigv4 'aws:amz:us-east-1:s3' \
		--user veschi:veschi-secret http://127.0.0.1:9900/veschi
}

admin_count() {
	docker exec veschi-smoke-pg psql -U veschi -d veschi -tAc \
		"SELECT count(*) FROM \"User\" WHERE login = 'admin'"
}

docker network create "$NET" >/dev/null
docker run -d --name veschi-smoke-pg --network "$NET" \
	-e POSTGRES_USER=veschi -e POSTGRES_PASSWORD=veschi -e POSTGRES_DB=veschi \
	postgres:16-alpine >/dev/null
docker run -d --name veschi-smoke-minio --network "$NET" -p 127.0.0.1:9900:9000 \
	-e MINIO_ROOT_USER=veschi -e MINIO_ROOT_PASSWORD=veschi-secret -e MINIO_SKIP_CLIENT=yes \
	"$MINIO_IMAGE" >/dev/null

retry 60 docker exec veschi-smoke-pg pg_isready -U veschi -d veschi || fail 'PostgreSQL did not start'
retry 60 curl -fsS http://127.0.0.1:9900/minio/health/live || fail 'MinIO did not start'
[ "$(bucket_status)" = 404 ] || fail 'bucket exists before the app started'

docker run -d --name veschi-smoke-app --network "$NET" -p "$PORT:3000" \
	-e ORIGIN="$BASE" \
	-e DATABASE_URL=postgresql://veschi:veschi@veschi-smoke-pg:5432/veschi \
	-e S3_ENDPOINT=http://veschi-smoke-minio:9000 \
	-e S3_ACCESS_KEY=veschi -e S3_SECRET_KEY=veschi-secret -e S3_BUCKET=veschi \
	-e ADMIN_LOGIN=admin -e ADMIN_PASSWORD=smoke-password \
	"$IMAGE" >/dev/null

retry 90 curl -fsS "$BASE/healthz" || fail '/healthz did not answer 200'
echo 'ok: /healthz 200 with an empty database and bucket'

[ "$(http "$BASE/")" = "303 $BASE/login?next=%2F" ] || fail 'GET / does not redirect to /login'
[ "$(http "$BASE/api/search?q=x")" = '401 ' ] || fail 'GET /api/search is not 401'
[ "$(http "$BASE/files/x")" = '401 ' ] || fail 'GET /files/x is not 401'
echo 'ok: pages redirect to /login, API and files answer 401'

[ "$(bucket_status)" = 200 ] || fail 'bucket was not created'
echo 'ok: bucket created'

[ "$(admin_count)" = 1 ] || fail 'admin user was not created'
login=$(http -c "$COOKIES" -H "Origin: $BASE" -H "Accept: text/html" \
	--data-urlencode login=admin --data-urlencode password=smoke-password "$BASE/login")
[ "$login" = "303 $BASE/" ] || fail "login failed: $login"
[ "$(http -b "$COOKIES" "$BASE/")" = '200 ' ] || fail 'GET / after login is not 200'
echo 'ok: admin created and can sign in'

docker restart veschi-smoke-app >/dev/null
retry 90 curl -fsS "$BASE/healthz" || fail '/healthz did not answer 200 after restart'
[ "$(admin_count)" = 1 ] || fail 'admin user duplicated after restart'
echo 'ok: restart keeps a single admin user'

echo 'Smoke test passed'
