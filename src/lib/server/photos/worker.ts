import { buffer } from 'node:stream/consumers';
import { db, writeTransaction } from '$lib/server/db';
import { config } from '$lib/server/env';
import { storage } from '$lib/server/storage';
import { deleteStored, thumbKeyOf } from '$lib/server/services/files';
import { ComfyClient, ProcessorUnavailableError } from './comfy';
import { EmptyCutoutError, cutoutVariants, processorInput } from './encode';
import {
	backfillPhotoJobs,
	claimPhotoJob,
	photoJobCancelled,
	photoJobDone,
	photoJobFailed,
	photoJobPostponed,
	requeueStalePhotoJobs,
	STALE_AFTER_MS,
	type ClaimedJob
} from './queue';
import { newCutoutKey, shownKey, sourceOf } from './versions';
import { CUTOUT } from './workflows';

/** What the worker needs from a processor; the ComfyUI client in production, a fake in tests. */
export interface PhotoProcessor {
	/** The picture without background, as an image with alpha. */
	cutout(image: Buffer): Promise<Buffer>;
}

/** Longest wait for a cutout, ms (a cold start of a cloud GPU included). */
const CUTOUT_TIMEOUT_MS = 3 * 60_000;
/** Pause between queue checks when it is empty, ms. */
const IDLE_MS = 5000;

export function comfyProcessor(baseUrl: string, apiKey?: string): PhotoProcessor {
	const client = new ComfyClient({ baseUrl, apiKey });
	return { cutout: (image) => client.run(CUTOUT, image, CUTOUT_TIMEOUT_MS) };
}

async function cutout(job: ClaimedJob, processor: PhotoProcessor): Promise<void> {
	const type = await db.itemType.findUnique({ where: { id: job.typeId } });
	if (!type || sourceOf(type) !== job.sourceKey) return photoJobCancelled(job.id);
	const source = await storage().get(job.sourceKey);
	if (!source) return photoJobFailed(job, 'Исходное фото не найдено в хранилище', false);

	const input = await processorInput(await buffer(source.body));
	const { full, thumb } = await cutoutVariants(await processor.cutout(input));

	const key = newCutoutKey(job.typeId);
	await storage().put(key, full, 'image/webp');
	await storage().put(thumbKeyOf(key), thumb, 'image/webp');
	const previous = await writeTransaction(async (tx) => {
		const current = await tx.itemType.findUnique({ where: { id: job.typeId } });
		if (!current || sourceOf(current) !== job.sourceKey) return null;
		const next = { ...current, photoCutoutKey: key };
		await tx.itemType.update({
			where: { id: current.id },
			data: { photoCutoutKey: key, photoKey: shownKey(next, current.photoChoice) }
		});
		return { cutout: current.photoCutoutKey };
	});
	if (!previous) {
		// The photo was replaced or removed while the processor worked.
		await deleteStored(key);
		return photoJobCancelled(job.id);
	}
	if (previous.cutout) await deleteStored(previous.cutout);
	await photoJobDone(job.id);
}

/** Runs the next due job; returns false when the queue had nothing to do. */
export async function processNextPhotoJob(processor: PhotoProcessor): Promise<boolean> {
	const job = await claimPhotoJob();
	if (!job) return false;
	const started = Date.now();
	try {
		await cutout(job, processor);
		console.info(
			`Photo ${job.stage.toLowerCase()} of type ${job.typeId}: ${Date.now() - started} ms`
		);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.warn(`Photo ${job.stage.toLowerCase()} of type ${job.typeId} failed: ${message}`);
		if (e instanceof ProcessorUnavailableError) await photoJobPostponed(job, message);
		else await photoJobFailed(job, message, !(e instanceof EmptyCutoutError));
	}
	return true;
}

let wake: (() => void) | null = null;
let running = false;

/** Makes an idle worker look at the queue now (after an upload). */
export function wakePhotoWorker(): void {
	wake?.();
}

/**
 * Starts the worker when processing is on: puts lost jobs back, queues the
 * backfill of old photos and then runs jobs one by one until the process ends.
 */
export function startPhotoWorker(): void {
	const c = config();
	if (c.PHOTO_PROCESSING === 'off' || !c.PHOTO_PROCESSOR_URL || running) return;
	running = true;
	const processor = comfyProcessor(c.PHOTO_PROCESSOR_URL, c.PHOTO_PROCESSOR_API_KEY);
	void (async () => {
		try {
			// One app instance: at start every running job belongs to a stopped process.
			await requeueStalePhotoJobs(new Date(Date.now() + STALE_AFTER_MS));
			const queued = await backfillPhotoJobs();
			if (queued > 0) console.info(`Queued ${queued} old photos for processing`);
		} catch (e) {
			console.error('Photo queue setup failed', e);
		}
		for (;;) {
			let busy = false;
			try {
				await requeueStalePhotoJobs();
				busy = await processNextPhotoJob(processor);
			} catch (e) {
				console.error('Photo worker error', e);
			}
			if (busy) continue;
			await new Promise<void>((resolve) => {
				const timer = setTimeout(resolve, IDLE_MS);
				wake = () => {
					clearTimeout(timer);
					resolve();
				};
			});
			wake = null;
		}
	})();
}
