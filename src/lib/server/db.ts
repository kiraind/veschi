import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Shared Prisma client (one per process; reused across Vite HMR reloads in dev). */
export const db: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/** Transaction client type, for helpers that run inside `db.$transaction`. */
export type Tx = Omit<
	PrismaClient,
	'$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
