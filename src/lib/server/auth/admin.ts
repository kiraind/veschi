import { db } from '$lib/server/db';
import { hashPassword, verifyPassword } from './password';

/**
 * Creates the first user from ADMIN_LOGIN / ADMIN_PASSWORD. An existing user
 * with that login is left as is, so a password changed in «Настройки»
 * survives restarts. With `resetPassword` (ADMIN_RESET_PASSWORD=1) the
 * password is set to ADMIN_PASSWORD and all sessions of the user end: the way
 * to recover a forgotten password.
 */
export async function ensureAdminUser(
	login: string | undefined,
	password: string | undefined,
	name?: string,
	resetPassword = false
): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
	if (!login || !password) return 'skipped';
	const existing = await db.user.findUnique({ where: { login } });
	if (!existing) {
		await db.user.create({
			data: { login, name: name ?? login, passwordHash: await hashPassword(password) }
		});
		return 'created';
	}
	if (!resetPassword || (await verifyPassword(existing.passwordHash, password))) {
		return 'unchanged';
	}
	await db.user.update({
		where: { id: existing.id },
		data: { passwordHash: await hashPassword(password) }
	});
	await db.session.deleteMany({ where: { userId: existing.id } });
	return 'updated';
}
