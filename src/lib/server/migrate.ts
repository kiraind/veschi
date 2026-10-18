import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Applies pending migrations from prisma/migrations, as `prisma migrate deploy`
 * does, so the image needs no Prisma CLI (70 MB with its engines). It keeps the
 * same bookkeeping table and checksums, so `prisma migrate dev` and
 * `prisma migrate status` keep working against the same database.
 *
 * Unlike Prisma, each migration runs in a transaction: a failed one leaves no
 * half-applied schema and is recorded as rolled back, so the next start retries it.
 */

/** Advisory lock key Prisma Migrate uses, so the CLI and the app never migrate at once. */
const LOCK_KEY = 72707369;

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
	"id" VARCHAR(36) PRIMARY KEY NOT NULL,
	"checksum" VARCHAR(64) NOT NULL,
	"finished_at" TIMESTAMPTZ,
	"migration_name" VARCHAR(255) NOT NULL,
	"logs" TEXT,
	"rolled_back_at" TIMESTAMPTZ,
	"started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
	"applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export interface MigrationFile {
	name: string;
	sql: string;
	checksum: string;
}

/** Migration folders in name (= timestamp) order, with the checksum Prisma stores: SHA-256 of migration.sql. */
export async function readMigrations(dir: string): Promise<MigrationFile[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const names = entries
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();
	return Promise.all(
		names.map(async (name) => {
			const sql = await readFile(join(dir, name, 'migration.sql'), 'utf8');
			return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
		})
	);
}

/**
 * Connection options for `pg` from a Prisma DATABASE_URL: Prisma-only query
 * parameters are dropped, and `schema` (default `public`, as in Prisma) becomes
 * the search path.
 */
export function pgConfig(databaseUrl: string): { config: pg.ClientConfig; schema: string } {
	const url = new URL(databaseUrl);
	const schema = url.searchParams.get('schema') || 'public';
	for (const key of [
		'schema',
		'connection_limit',
		'pool_timeout',
		'connect_timeout',
		'socket_timeout',
		'pgbouncer',
		'statement_cache_size'
	]) {
		url.searchParams.delete(key);
	}
	return {
		config: { connectionString: url.toString(), options: `-c search_path=${quoteIdent(schema)}` },
		schema
	};
}

function quoteIdent(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

interface AppliedRow {
	migration_name: string;
	checksum: string;
	finished_at: Date | null;
	rolled_back_at: Date | null;
}

/** Applies the migrations not yet in the database; returns the names of those applied. */
export async function migrate(
	databaseUrl: string,
	dir: string,
	log: (message: string) => void = console.info
): Promise<string[]> {
	const migrations = await readMigrations(dir);
	const { config, schema } = pgConfig(databaseUrl);
	const client = new pg.Client(config);
	await client.connect();
	try {
		await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
		// Prisma creates the schema from the URL too; `public` usually exists already.
		await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
		await client.query(CREATE_TABLE);
		const { rows } = await client.query<AppliedRow>(
			'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"'
		);
		const failed = rows.find((r) => !r.finished_at && !r.rolled_back_at);
		if (failed) {
			throw new Error(
				`Migration ${failed.migration_name} failed earlier and was not rolled back: ` +
					'fix the database by hand and mark it with `prisma migrate resolve`'
			);
		}
		const applied = new Map(rows.filter((r) => r.finished_at).map((r) => [r.migration_name, r]));
		for (const m of migrations) {
			const row = applied.get(m.name);
			if (row && row.checksum !== m.checksum) {
				log(`Migration ${m.name} was changed after it was applied; it is not applied again`);
			}
		}

		const done: string[] = [];
		for (const m of migrations.filter((m) => !applied.has(m.name))) {
			const id = randomUUID();
			await client.query(
				'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1, $2, $3, now())',
				[id, m.checksum, m.name]
			);
			try {
				// A query without parameters goes over the simple protocol, which runs a whole script.
				await client.query(`BEGIN;\n${m.sql}\n;COMMIT;`);
			} catch (e) {
				await client.query('ROLLBACK').catch(() => {});
				await client.query(
					'UPDATE "_prisma_migrations" SET logs = $2, rolled_back_at = now() WHERE id = $1',
					[id, e instanceof Error ? e.message : String(e)]
				);
				throw new Error(`Migration ${m.name} failed and was rolled back: ${String(e)}`, {
					cause: e
				});
			}
			await client.query(
				'UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1',
				[id]
			);
			log(`Applied migration ${m.name}`);
			done.push(m.name);
		}
		return done;
	} finally {
		await client.end();
	}
}
