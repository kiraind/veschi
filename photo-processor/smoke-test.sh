#!/bin/sh
# Smoke test of the photo-processor image without a GPU: starts ComfyUI on the
# CPU, runs the app's cutout workflow (src/lib/server/photos/workflows) on a
# drawn picture and checks the result has a transparent background. Downloads
# the BiRefNet model (about 1 GB) on the way.
#   photo-processor/smoke-test.sh veschi-photo-processor:ci
set -eu
IMAGE=${1:?image name}
NAME=veschi-photo-smoke
URL=http://127.0.0.1:8188
WORKFLOW=$(dirname "$0")/../src/lib/server/photos/workflows/cutout.json

cleanup() {
	status=$?
	[ $status -ne 0 ] && docker logs "$NAME" 2>&1 | tail -50
	docker rm -f "$NAME" >/dev/null 2>&1 || true
	exit $status
}
trap cleanup EXIT

docker run -d --name "$NAME" -p 8188:8188 "$IMAGE" --cpu >/dev/null

echo "Waiting for ComfyUI…"
for _ in $(seq 1 90); do
	curl -fsS "$URL/api/system_stats" >/dev/null 2>&1 && break
	sleep 2
done
curl -fsS "$URL/api/object_info/BiRefNetRMBG" | grep -q BiRefNet_dynamic \
	|| { echo "The BiRefNetRMBG node with BiRefNet_dynamic is missing"; exit 1; }

# A dark box on a light background.
docker exec "$NAME" python -c "
from PIL import Image, ImageDraw
im = Image.new('RGB', (480, 360), (235, 235, 230))
ImageDraw.Draw(im).rectangle((150, 90, 330, 270), fill=(40, 70, 160))
im.save('/tmp/comfy/input/smoke.png')"

PROMPT=$(jq -c '.["1"].inputs.image = "smoke.png" | {prompt: .}' "$WORKFLOW")
ID=$(curl -fsS -H 'content-type: application/json' -d "$PROMPT" "$URL/api/prompt" | jq -r .prompt_id)
echo "Running the cutout ($ID)…"
for _ in $(seq 1 300); do
	STATUS=$(curl -fsS "$URL/api/history/$ID" | jq -r --arg id "$ID" '.[$id].status.status_str // empty')
	[ -n "$STATUS" ] && break
	sleep 2
done
[ "$STATUS" = success ] || { echo "The workflow ended with: ${STATUS:-timeout}"; exit 1; }
FILE=$(curl -fsS "$URL/api/history/$ID" | jq -r --arg id "$ID" '.[$id].outputs["3"].images[0].filename')

docker exec "$NAME" python -c "
from PIL import Image
im = Image.open('/tmp/comfy/output/$FILE')
assert im.mode == 'RGBA', im.mode
alpha = im.getchannel('A')
assert alpha.getpixel((10, 10)) < 30, 'the background is not transparent'
assert alpha.getpixel((240, 180)) > 220, 'the object is not opaque'
print('Cutout OK:', im.size)"
