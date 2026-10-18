import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { pgConfig } from '$lib/server/migrate';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Shared Prisma client (one per process; reused across Vite HMR reloads in dev).
 * It talks to PostgreSQL through `pg` (engineType = "client" in schema.prisma).
 */
export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

function createClient(): PrismaClient {
	// The client connects on the first query: during `vite build` there is no DATABASE_URL.
	const url = process.env.DATABASE_URL;
	const { config, schema } = url ? pgConfig(url) : { config: {}, schema: undefined };
	return new PrismaClient({ adapter: new PrismaPg(config, { schema }) });
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/** Transaction client type, for helpers that run inside `db.$transaction`. */
export type Tx = Omit<
	PrismaClient,
	'$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Key of the advisory lock that serializes every change of the catalog. */
const WRITE_LOCK_KEY = 0x7665_7363;

/**
 * Runs `fn` in a transaction that first takes one advisory lock shared by all
 * changes of the catalog. Services read a record and then write values that
 * depend on it (a quantity, a parent, a sticker status), and READ COMMITTED
 * alone lets two such requests interleave: a double tap would split one box
 * into 13 things out of 10, and two crossing moves would make a cycle. A home
 * catalog has few writers, so serializing them costs nothing noticeable.
 */
export function writeTransaction<T>(
	fn: (tx: Tx) => Promise<T>,
	options?: { maxWait?: number; timeout?: number }
): Promise<T> {
	return db.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WRITE_LOCK_KEY})`;
		return fn(tx);
	}, options);
}
