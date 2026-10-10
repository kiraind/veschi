import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { createTestActor } from '$lib/server/testing/db';
import {
	authenticate,
	changePassword,
	createSession,
	invalidateSession,
	validateSession
} from './session';

const DAY = 24 * 60 * 60 * 1000;

describe('authenticate', () => {
	let userId: string;

	beforeEach(async () => {
		userId = (await createTestActor('admin')).userId;
	});

	it('returns the user for the right login and password', async () => {
		expect(await authenticate('admin', 'password')).toBe(userId);
		expect(await authenticate(' admin ', 'password')).toBe(userId);
	});

	it('rejects a wrong login and a wrong password the same way', async () => {
		const wrongLogin = await authenticate('nobody', 'password');
		const wrongPassword = await authenticate('admin', 'wrong-password');
		expect(wrongLogin).toBeNull();
		expect(wrongPassword).toBeNull();
	});
});

describe('sessions', () => {
	let userId: string;

	beforeEach(async () => {
		userId = (await createTestActor('admin')).userId;
	});

	it('creates a session that resolves to its user; the token itself is not stored', async () => {
		const { token, expiresAt } = await createSession(userId);
		expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
		expect(await db.session.findUnique({ where: { id: token } })).toBeNull();

		const session = await validateSession(token);
		expect(session?.user).toMatchObject({ id: userId, login: 'admin', householdIds: [] });
	});

	it('rejects an unknown token', async () => {
		await createSession(userId);
		expect(await validateSession('not-a-token')).toBeNull();
	});

	it('invalidates a session', async () => {
		const { token } = await createSession(userId);
		const session = await validateSession(token);
		await invalidateSession(session!.sessionId);
		expect(await validateSession(token)).toBeNull();
	});

	it('deletes an expired session', async () => {
		const { token } = await createSession(userId);
		await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
		expect(await validateSession(token)).toBeNull();
		expect(await db.session.count()).toBe(0);
	});

	it('extends a session that is close to expiry', async () => {
		const { token } = await createSession(userId);
		await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + DAY) } });
		const session = await validateSession(token);
		expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
	});
});

describe('changePassword', () => {
	it('requires the current password', async () => {
		const { userId } = await createTestActor('admin');
		expect(await changePassword(userId, 'wrong', 'new-password')).toBe(false);
		expect(await authenticate('admin', 'password')).toBe(userId);

		expect(await changePassword(userId, 'password', 'new-password')).toBe(true);
		expect(await authenticate('admin', 'password')).toBeNull();
		expect(await authenticate('admin', 'new-password')).toBe(userId);
	});

	it('signs out every other session', async () => {
		const { userId } = await createTestActor('admin');
		const current = await createSession(userId);
		const other = await createSession(userId);
		const currentId = (await validateSession(current.token))?.sessionId;
		expect(await changePassword(userId, 'password', 'new-password', currentId)).toBe(true);
		expect(await validateSession(current.token)).not.toBeNull();
		expect(await validateSession(other.token)).toBeNull();
	});
});
