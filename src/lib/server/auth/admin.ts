import { db } from '$lib/server/db';
import { hashPassword, verifyPassword } from './password';

/**
 * Creates the first user from ADMIN_LOGIN / ADMIN_PASSWORD. Idempotent: an
 * existing user with that login is left as is, except that the password is
 * reset when it no longer matches ADMIN_PASSWORD (the documented way to
 * recover a forgotten password is restarting with a new ADMIN_PASSWORD).
 */
export async function ensureAdminUser(
	login: string | undefined,
	password: string | undefined,
	name?: string
): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
	if (!login || !password) return 'skipped';
	const existing = await db.user.findUnique({ where: { login } });
	if (!existing) {
		await db.user.create({
			data: { login, name: name ?? login, passwordHash: await hashPassword(password) }
		});
		return 'created';
	}
	if (await verifyPassword(existing.passwordHash, password)) return 'unchanged';
	await db.user.update({
		where: { id: existing.id },
		data: { passwordHash: await hashPassword(password) }
	});
	await db.session.deleteMany({ where: { userId: existing.id } });
	return 'updated';
}
