import { describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import { findNewId, redirectLegacyId } from './legacy';

describe('legacy ids', () => {
	const oldId = '33333333-3333-4333-8333-333333333332';

	it('maps an old UUID to its cuid, only for the same model', async () => {
		await db.legacyId.create({
			data: { oldId, model: 'Item', newId: 'cmv2qfe3drsjj9syzvrcod7pl' }
		});
		expect(await findNewId('Item', oldId.toUpperCase())).toBe('cmv2qfe3drsjj9syzvrcod7pl');
		expect(await findNewId('ItemType', oldId)).toBeNull();
		expect(await findNewId('Item', 'cmv2qfe3drsjj9syzvrcod7pl')).toBeNull();
	});

	it('redirects an old link permanently and lets other ids through', async () => {
		await db.legacyId.create({ data: { oldId, model: 'Item', newId: 'cnew' } });
		await expect(redirectLegacyId('Item', oldId, (id) => `/items/${id}`)).rejects.toMatchObject({
			status: 301,
			location: '/items/cnew'
		});
		await expect(redirectLegacyId('Item', 'cnew', (id) => `/items/${id}`)).resolves.toBeUndefined();
	});
});
