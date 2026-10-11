import { describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { ensureAdminUser } from './admin';
import { verifyPassword } from './password';
import { changePassword, createSession } from './session';

describe('ensureAdminUser', () => {
	it('creates the first user once; a second start does not duplicate it', async () => {
		expect(await ensureAdminUser('admin', 'secret-1', 'Хозяин')).toBe('created');
		expect(await ensureAdminUser('admin', 'secret-1', 'Хозяин')).toBe('unchanged');
		expect(await db.user.count()).toBe(1);
		const user = await db.user.findUniqueOrThrow({ where: { login: 'admin' } });
		expect(user.name).toBe('Хозяин');
		expect(await verifyPassword(user.passwordHash, 'secret-1')).toBe(true);
	});

	it('uses the login as the name by default', async () => {
		await ensureAdminUser('admin', 'secret-1');
		expect((await db.user.findUniqueOrThrow({ where: { login: 'admin' } })).name).toBe('admin');
	});

	it('keeps a changed password and sessions on restart without the reset flag', async () => {
		await ensureAdminUser('admin', 'env-password');
		const user = await db.user.findUniqueOrThrow({ where: { login: 'admin' } });
		await changePassword(user.id, 'env-password', 'my-password');
		await createSession(user.id);
		expect(await ensureAdminUser('admin', 'env-password')).toBe('unchanged');
		const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(await verifyPassword(after.passwordHash, 'my-password')).toBe(true);
		expect(await db.session.count()).toBe(1);
	});

	it('resets the password and sessions with ADMIN_RESET_PASSWORD', async () => {
		await ensureAdminUser('admin', 'old-password');
		const user = await db.user.findUniqueOrThrow({ where: { login: 'admin' } });
		await createSession(user.id);
		expect(await ensureAdminUser('admin', 'new-password', undefined, true)).toBe('updated');
		const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(await verifyPassword(updated.passwordHash, 'new-password')).toBe(true);
		expect(await db.session.count()).toBe(0);
		expect(await db.user.count()).toBe(1);
	});

	it('does nothing without ADMIN_LOGIN or ADMIN_PASSWORD', async () => {
		expect(await ensureAdminUser(undefined, 'secret')).toBe('skipped');
		expect(await ensureAdminUser('admin', undefined)).toBe('skipped');
		expect(await db.user.count()).toBe(0);
	});
});
