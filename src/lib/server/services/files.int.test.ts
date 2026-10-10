import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { createTestActor } from '$lib/server/testing/db';
import { MAX_PARAM_FILE_SIZE } from '$lib/domain/params';
import { openFile, uploadParamFile } from './files';
import { createItem } from './items';
import { setKeyedParams } from '$lib/server/testing/params';

describe('files', () => {
	let actor: Actor;
	let other: Actor;

	beforeEach(async () => {
		actor = await createTestActor();
		other = await createTestActor('other');
	});

	async function upload(owner = actor) {
		return uploadParamFile(owner, {
			name: 'manual.pdf',
			type: 'application/pdf',
			data: Buffer.from('%PDF-1.4')
		});
	}

	it('rejects files over 50 MB and empty files', async () => {
		const big = Buffer.alloc(MAX_PARAM_FILE_SIZE + 1);
		await expect(uploadParamFile(actor, { name: 'big.bin', type: '', data: big })).rejects.toThrow(
			'больше'
		);
		await expect(
			uploadParamFile(actor, { name: 'e.txt', type: 'text/plain', data: Buffer.alloc(0) })
		).rejects.toThrow('пустой');
	});

	it('opens a saved file parameter for its owner only', async () => {
		const file = await upload();
		const item = await createItem(actor, { newTypeName: 'Паяльник' });
		await setKeyedParams(actor, { itemId: item.id }, [{ key: 'инструкция', ...file }]);

		const opened = await openFile(actor, file.fileKey);
		expect(opened).toMatchObject({
			contentType: 'application/pdf',
			fileName: 'manual.pdf',
			size: 8
		});
		await expect(openFile(other, file.fileKey)).rejects.toThrow('не найден');
	});

	it('opens a type photo for its owner only', async () => {
		const file = await upload();
		await db.itemType.create({
			data: { ownerId: actor.userId, name: 'Нож', photoKey: file.fileKey }
		});
		await expect(openFile(actor, file.fileKey)).resolves.toBeTruthy();
		await expect(openFile(other, file.fileKey)).rejects.toThrow('не найден');
	});

	it('opens a fresh upload for the uploader and rejects unknown keys', async () => {
		const file = await upload();
		await expect(openFile(actor, file.fileKey)).resolves.toMatchObject({ fileName: null });
		await expect(openFile(other, file.fileKey)).rejects.toThrow('не найден');
		await expect(openFile(actor, 'types/x/y.webp')).rejects.toThrow('не найден');
		await expect(openFile(actor, `params/${actor.userId}/../x`)).rejects.toThrow('не найден');
	});
});
