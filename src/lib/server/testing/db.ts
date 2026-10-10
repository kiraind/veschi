import { db } from '$lib/server/db';
import { hashPassword } from '$lib/server/auth/password';
import type { Actor } from '$lib/server/scope';

/** Deletes all rows from every application table. */
export async function resetDatabase(): Promise<void> {
	const tables = await db.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables
		WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
	`;
	if (tables.length === 0) return;
	const list = tables.map((t) => `"${t.tablename}"`).join(', ');
	await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let passwordHash: Promise<string> | null = null;

/** Creates a user and returns its actor (password: "password"). */
export async function createTestActor(login = 'tester'): Promise<Actor> {
	passwordHash ??= hashPassword('password');
	const user = await db.user.create({
		data: { login, name: login, passwordHash: await passwordHash }
	});
	return { userId: user.id, householdIds: [] };
}
