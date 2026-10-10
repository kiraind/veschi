import { beforeEach, describe, expect, it } from 'vitest';
import { authenticate } from '$lib/server/auth/session';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { POST } from './+server';

function post(actor: Actor | null, body: unknown) {
	const event = {
		request: new Request('http://localhost/api/profile/password', {
			method: 'POST',
			body: JSON.stringify(body)
		}),
		locals: { actor }
	} as unknown as Parameters<typeof POST>[0];
	return POST(event);
}

describe('POST /api/profile/password', () => {
	let actor: Actor;

	beforeEach(async () => {
		actor = await createTestActor('admin');
	});

	it('changes the password', async () => {
		const response = await post(actor, {
			currentPassword: 'password',
			newPassword: 'new-password'
		});
		expect(response.status).toBe(204);
		expect(await authenticate('admin', 'new-password')).toBe(actor.userId);
	});

	it('rejects a wrong current password', async () => {
		const response = await post(actor, { currentPassword: 'wrong', newPassword: 'new-password' });
		expect(response.status).toBe(400);
		expect((await response.json()).error.message).toBe('Неверный текущий пароль');
		expect(await authenticate('admin', 'password')).toBe(actor.userId);
	});

	it('rejects a new password shorter than 8 characters', async () => {
		const response = await post(actor, { currentPassword: 'password', newPassword: 'short' });
		expect(response.status).toBe(400);
		expect(await authenticate('admin', 'password')).toBe(actor.userId);
	});

	it('requires a signed-in user', async () => {
		const response = await post(null, { currentPassword: 'password', newPassword: 'new-password' });
		expect(response.status).toBe(401);
	});
});
