import { buffer } from 'node:stream/consumers';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { createTestActor } from '$lib/server/testing/db';
import { openFile, thumbKeyOf } from '$lib/server/services/files';
import {
	createType,
	deleteType,
	getPhotoState,
	removeTypePhoto,
	reprocessTypePhoto,
	setPhotoChoice,
	setTypePhoto
} from '$lib/server/services/types';
import { ProcessorUnavailableError } from './comfy';
import { backfillPhotoJobs, requeueStalePhotoJobs, STALE_AFTER_MS } from './queue';
import { processNextPhotoJob, type PhotoProcessor } from './worker';

const settings = vi.hoisted(() => ({ PHOTO_PROCESSING: 'cutout' as 'off' | 'cutout' }));

vi.mock('$lib/server/env', async (original) => {
	const actual = await original<typeof import('$lib/server/env')>();
	return { config: () => ({ ...actual.config(), ...settings }) };
});

function photo(): Promise<Buffer> {
	return sharp({
		create: { width: 300, height: 200, channels: 3, background: { r: 240, g: 240, b: 240 } }
	})
		.composite([
			{
				input: {
					create: { width: 100, height: 80, channels: 3, background: { r: 30, g: 60, b: 160 } }
				},
				left: 100,
				top: 60
			}
		])
		.jpeg()
		.toBuffer();
}

/** A processor that "cuts out" the blue box: makes everything light transparent. */
const fakeProcessor: PhotoProcessor = {
	async cutout(image) {
		const { data, info } = await sharp(image)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		for (let i = 0; i < data.length; i += 4) if (data[i]! > 200) data[i + 3] = 0;
		return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
			.png()
			.toBuffer();
	}
};

const failing = (error: Error): PhotoProcessor => ({
	cutout: async () => {
		throw error;
	}
});

async function exists(key: string): Promise<boolean> {
	return (await storage().get(key)) !== null;
}

describe('photo processing', () => {
	let actor: Actor;

	beforeEach(async () => {
		settings.PHOTO_PROCESSING = 'cutout';
		actor = await createTestActor();
	});

	it('shows the original at once and the cutout once the job is done', async () => {
		const type = await createType(actor, { name: 'Кружка' });
		const original = await setTypePhoto(actor, type.id, await photo());
		let row = await db.itemType.findUniqueOrThrow({ where: { id: type.id } });
		expect(row.photoKey).toBe(original);
		expect(row.photoSourceKey).toMatch(/\.source$/);
		expect(await getPhotoState(actor, type.id)).toMatchObject({
			available: ['ORIGINAL'],
			processing: true,
			enabled: true
		});

		expect(await processNextPhotoJob(fakeProcessor)).toBe(true);
		row = await db.itemType.findUniqueOrThrow({ where: { id: type.id } });
		expect(row.photoCutoutKey).toMatch(/\.cutout\.webp$/);
		expect(row.photoKey).toBe(row.photoCutoutKey);
		expect(await exists(thumbKeyOf(row.photoCutoutKey!))).toBe(true);
		expect(await getPhotoState(actor, type.id)).toMatchObject({
			choice: 'AUTO',
			available: ['CUTOUT', 'ORIGINAL'],
			processing: false,
			failed: false
		});
		// The blue box framed with 6% margins: 100 px / 0.88.
		const cutout = await openFile(actor, row.photoCutoutKey!);
		expect((await sharp(await buffer(cutout.body)).metadata()).width).toBe(114);

		// Both versions stay reachable, and the choice switches the shown one.
		await setPhotoChoice(actor, type.id, 'ORIGINAL');
		row = await db.itemType.findUniqueOrThrow({ where: { id: type.id } });
		expect(row.photoKey).toBe(original);
		await expect(openFile(actor, row.photoCutoutKey!)).resolves.toBeTruthy();
		await setPhotoChoice(actor, type.id, 'CUTOUT');
		expect((await db.itemType.findUniqueOrThrow({ where: { id: type.id } })).photoKey).toBe(
			row.photoCutoutKey
		);
		expect(await processNextPhotoJob(fakeProcessor)).toBe(false);
	});

	it('keeps photos as before when processing is off', async () => {
		settings.PHOTO_PROCESSING = 'off';
		const type = await createType(actor, { name: 'Нож' });
		await setTypePhoto(actor, type.id, await photo());
		const row = await db.itemType.findUniqueOrThrow({ where: { id: type.id } });
		expect(row.photoSourceKey).toBeNull();
		expect(await db.photoJob.count()).toBe(0);
		expect(await getPhotoState(actor, type.id)).toMatchObject({
			enabled: false,
			processing: false
		});
		await expect(reprocessTypePhoto(actor, type.id)).rejects.toThrow('Обработка фото выключена');
	});

	it('throws away the result for a photo replaced meanwhile', async () => {
		const type = await createType(actor, { name: 'Лампа' });
		await setTypePhoto(actor, type.id, await photo());
		const slow: PhotoProcessor = {
			async cutout(image) {
				await setTypePhoto(actor, type.id, await photo());
				return fakeProcessor.cutout(image);
			}
		};
		await processNextPhotoJob(slow);
		const row = await db.itemType.findUniqueOrThrow({ where: { id: type.id } });
		expect(row.photoCutoutKey).toBeNull();
		const jobs = await db.photoJob.findMany({ orderBy: { createdAt: 'asc' } });
		expect(jobs.map((j) => j.status)).toEqual(['CANCELLED', 'PENDING']);
		const cutouts = (await db.itemType.findMany()).flatMap((t) => [t.photoCutoutKey]);
		expect(cutouts).toEqual([null]);

		await processNextPhotoJob(fakeProcessor);
		expect(
			(await db.itemType.findUniqueOrThrow({ where: { id: type.id } })).photoCutoutKey
		).not.toBeNull();
	});

	it('retries a failure, then gives up; an unreachable processor does not count', async () => {
		const type = await createType(actor, { name: 'Пила' });
		await setTypePhoto(actor, type.id, await photo());

		await processNextPhotoJob(failing(new ProcessorUnavailableError('down')));
		let job = await db.photoJob.findFirstOrThrow();
		expect([job.status, job.attempts]).toEqual(['PENDING', 0]);
		expect(job.runAfter.getTime()).toBeGreaterThan(Date.now());

		for (let attempt = 1; attempt <= 4; attempt++) {
			await db.photoJob.updateMany({ data: { runAfter: new Date(0) } });
			await processNextPhotoJob(failing(new Error('broken workflow')));
		}
		job = await db.photoJob.findFirstOrThrow();
		expect([job.status, job.attempts, job.error]).toEqual(['FAILED', 4, 'broken workflow']);
		expect(await getPhotoState(actor, type.id)).toMatchObject({ failed: true, processing: false });

		await reprocessTypePhoto(actor, type.id);
		expect(await getPhotoState(actor, type.id)).toMatchObject({ failed: false, processing: true });
	});

	it('puts a job lost by a stopped worker back', async () => {
		const type = await createType(actor, { name: 'Дрель' });
		await setTypePhoto(actor, type.id, await photo());
		await db.photoJob.updateMany({ data: { status: 'RUNNING', startedAt: new Date() } });
		expect(await requeueStalePhotoJobs()).toBe(0);
		expect(await requeueStalePhotoJobs(new Date(Date.now() + STALE_AFTER_MS + 1000))).toBe(1);
		expect((await db.photoJob.findFirstOrThrow()).status).toBe('PENDING');
	});

	it('backfills old photos once', async () => {
		settings.PHOTO_PROCESSING = 'off';
		const old = await createType(actor, { name: 'Старая' });
		await setTypePhoto(actor, old.id, await photo());
		await createType(actor, { name: 'Без фото' });
		settings.PHOTO_PROCESSING = 'cutout';

		expect(await backfillPhotoJobs()).toBe(1);
		expect(await backfillPhotoJobs()).toBe(0);
		await processNextPhotoJob(fakeProcessor);
		const row = await db.itemType.findUniqueOrThrow({ where: { id: old.id } });
		expect(row.photoKey).toBe(row.photoCutoutKey);
		expect(row.photoKey).toMatch(/\.cutout\.webp$/);
		expect(await backfillPhotoJobs()).toBe(0);
	});

	it('removes every version with the photo or the type', async () => {
		const type = await createType(actor, { name: 'Ведро' });
		await setTypePhoto(actor, type.id, await photo());
		await processNextPhotoJob(fakeProcessor);
		let row = await db.itemType.findUniqueOrThrow({ where: { id: type.id } });
		const keys = [row.photoSourceKey!, row.photoOriginalKey!, row.photoCutoutKey!];

		await removeTypePhoto(actor, type.id);
		for (const key of keys) expect(await exists(key)).toBe(false);
		expect(await getPhotoState(actor, type.id)).toBeNull();

		await setTypePhoto(actor, type.id, await photo());
		row = await db.itemType.findUniqueOrThrow({ where: { id: type.id } });
		const pending = [row.photoSourceKey!, row.photoOriginalKey!];
		await deleteType(actor, type.id);
		for (const key of pending) expect(await exists(key)).toBe(false);
		expect(await db.photoJob.count()).toBe(0);
	});
});
