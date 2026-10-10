import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { updateProfile } from './profile';

describe('updateProfile', () => {
	let actor: Actor;

	beforeEach(async () => {
		actor = await createTestActor('admin');
	});

	it('changes the display name, trimmed', async () => {
		expect(await updateProfile(actor, { name: '  Ной ' })).toEqual({ name: 'Ной' });
		const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
		expect(user.name).toBe('Ной');
		expect(user.login).toBe('admin');
	});

	it('rejects an empty or too long name', async () => {
		await expect(updateProfile(actor, { name: '   ' })).rejects.toThrow();
		await expect(updateProfile(actor, { name: 'я'.repeat(101) })).rejects.toThrow();
	});
});
