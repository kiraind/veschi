import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, pgConfig, readMigrations } from './migrate';

// The tests migrate fresh schemas next to the one in DATABASE_URL, which
// `prisma migrate deploy` has already migrated (see .github/workflows/ci.yml).
const databaseUrl = process.env.DATABASE_URL!;
const migrationsDir = resolve('prisma/migrations');
const schemas: string[] = [];
const tempDirs: string[] = [];

function urlWithSchema(schema: string): string {
	const url = new URL(databaseUrl);
	url.searchParams.set('schema', schema);
	return url.toString();
}

function newSchema(): string {
	const schema = `migrate_test_${Date.now()}_${schemas.length}`;
	schemas.push(schema);
	return schema;
}

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
	const client = new pg.Client(pgConfig(databaseUrl).config);
	await client.connect();
	try {
		return (await client.query<T>(sql, params)).rows;
	} finally {
		await client.end();
	}
}

/** Columns of every table in a schema, to compare two schemas. */
async function columns(schema: string) {
	const rows = await query<{ column_default: string | null }>(
		`SELECT table_name, column_name, data_type, is_nullable, column_default
		FROM information_schema.columns WHERE table_schema = $1
		ORDER BY table_name, column_name`,
		[schema]
	);
	// Defaults of enum columns name the enum with its schema when it is not on the search path.
	return rows.map((r) => ({
		...r,
		column_default: r.column_default?.replaceAll(`${schema}.`, '')
	}));
}

/** Indexes (with unique constraints and primary keys) of a schema. */
async function indexes(schema: string) {
	const rows = await query<{ indexname: string; indexdef: string }>(
		`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 ORDER BY indexname`,
		[schema]
	);
	return rows.map((r) => ({ ...r, indexdef: r.indexdef.replaceAll(`${schema}.`, '') }));
}

async function migrationsTable(schema: string) {
	return query<{
		migration_name: string;
		checksum: string;
		finished_at: Date | null;
		rolled_back_at: Date | null;
		logs: string | null;
	}>(
		`SELECT migration_name, checksum, finished_at, rolled_back_at, logs
		FROM "${schema}"."_prisma_migrations" ORDER BY started_at, migration_name`
	);
}

/** A migrations folder with the given migration.sql files, in order. */
async function tempMigrations(sqls: Record<string, string>): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'veschi-migrations-'));
	tempDirs.push(dir);
	for (const [name, sql] of Object.entries(sqls)) {
		await mkdir(join(dir, name));
		await writeFile(join(dir, name, 'migration.sql'), sql);
	}
	return dir;
}

afterEach(async () => {
	for (const schema of schemas.splice(0)) await query(`DROP SCHEMA "${schema}" CASCADE`);
	for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('migrate', () => {
	it('stores the same checksums as prisma migrate deploy', async () => {
		const schema = pgConfig(databaseUrl).schema;
		const prisma = await migrationsTable(schema);
		const ours = await readMigrations(migrationsDir);
		expect(ours.map((m) => [m.name, m.checksum])).toEqual(
			prisma.map((r) => [r.migration_name, r.checksum])
		);
	});

	it('builds the same schema as prisma migrate deploy', async () => {
		const schema = newSchema();
		const applied = await migrate(urlWithSchema(schema), migrationsDir, () => {});
		expect(applied).toEqual((await readMigrations(migrationsDir)).map((m) => m.name));
		const prismaSchema = pgConfig(databaseUrl).schema;
		expect(await columns(schema)).toEqual(await columns(prismaSchema));
		expect(await indexes(schema)).toEqual(await indexes(prismaSchema));
	});

	it('does nothing when every migration is applied', async () => {
		const schema = newSchema();
		await migrate(urlWithSchema(schema), migrationsDir, () => {});
		expect(await migrate(urlWithSchema(schema), migrationsDir, () => {})).toEqual([]);
		expect(await migrate(databaseUrl, migrationsDir, () => {})).toEqual([]);
	});

	it('rolls back a failed migration and retries it on the next run', async () => {
		const schema = newSchema();
		const url = urlWithSchema(schema);
		const dir = await tempMigrations({
			'1_ok': 'CREATE TABLE "A" ("id" INTEGER);',
			'2_bad': 'CREATE TABLE "B" ("id" INTEGER);\nINSERT INTO "Missing" VALUES (1);'
		});
		await expect(migrate(url, dir, () => {})).rejects.toThrow(/2_bad failed/);

		const rows = await migrationsTable(schema);
		expect(rows.map((r) => [r.migration_name, !!r.finished_at, !!r.rolled_back_at])).toEqual([
			['1_ok', true, false],
			['2_bad', false, true]
		]);
		expect(rows[1]?.logs).toMatch(/Missing/);
		const tables = await query(`SELECT tablename FROM pg_tables WHERE schemaname = $1`, [schema]);
		expect(tables.map((t) => t.tablename).sort()).toEqual(['A', '_prisma_migrations']);

		await writeFile(join(dir, '2_bad', 'migration.sql'), 'CREATE TABLE "B" ("id" INTEGER);');
		expect(await migrate(url, dir, () => {})).toEqual(['2_bad']);
	});

	it('leaves nothing behind when the connection drops mid-migration', async () => {
		const schema = newSchema();
		const url = urlWithSchema(schema);
		const dir = await tempMigrations({
			'1_ok': 'CREATE TABLE "A" ("id" INTEGER);',
			'2_cut': 'CREATE TABLE "B" ("id" INTEGER);\nSELECT pg_terminate_backend(pg_backend_pid());'
		});
		await expect(migrate(url, dir, () => {})).rejects.toThrow(/2_cut failed/);
		const rows = await migrationsTable(schema);
		expect(rows.map((r) => r.migration_name)).toEqual(['1_ok']);

		await writeFile(join(dir, '2_cut', 'migration.sql'), 'CREATE TABLE "B" ("id" INTEGER);');
		expect(await migrate(url, dir, () => {})).toEqual(['2_cut']);
	});

	it('runs scripts with function bodies and DO blocks', async () => {
		const schema = newSchema();
		const dir = await tempMigrations({
			'1_fn': `CREATE FUNCTION one() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;
DO $$ BEGIN PERFORM one(); END $$;`
		});
		expect(await migrate(urlWithSchema(schema), dir, () => {})).toEqual(['1_fn']);
	});

	it('refuses to run after a migration that failed without a rollback', async () => {
		const schema = newSchema();
		const url = urlWithSchema(schema);
		const dir = await tempMigrations({ '1_ok': 'CREATE TABLE "A" ("id" INTEGER);' });
		await migrate(url, dir, () => {});
		// What prisma migrate deploy leaves after a failure.
		await query(
			`INSERT INTO "${schema}"."_prisma_migrations" (id, checksum, migration_name)
			VALUES ('failed', 'x', '2_failed')`
		);
		await expect(migrate(url, dir, () => {})).rejects.toThrow(/2_failed failed earlier/);
	});
});
