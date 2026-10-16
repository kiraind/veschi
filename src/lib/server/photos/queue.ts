import type { PhotoJob, PhotoStage } from '@prisma/client';
import { db, type Tx } from '$lib/server/db';
import { sourceOf } from './versions';

/**
 * The queue of photo processing steps, a table in Postgres: jobs survive a
 * restart, and `FOR UPDATE SKIP LOCKED` keeps two app instances from taking
 * the same one. One GPU, so the worker takes one job at a time.
 */

/** Pauses before the next attempt after a failure, ms; one attempt more than pauses. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** A job running longer than this was lost (the app stopped mid-way) and is queued again. */
export const STALE_AFTER_MS = 15 * 60_000;
/** Pause before retrying while the processor is unreachable; such tries are not counted. */
export const UNAVAILABLE_DELAY_MS = 60_000;

export type ClaimedJob = Pick<PhotoJob, 'id' | 'typeId' | 'sourceKey' | 'stage' | 'attempts'>;

/** Queues a step for a type photo; fresh uploads (priority 1) go before the backfill. */
export async function enqueuePhotoJob(
	tx: Tx,
	job: { typeId: string; sourceKey: string; stage: PhotoStage; priority?: number }
): Promise<void> {
	await tx.photoJob.create({ data: { ...job, priority: job.priority ?? 0 } });
}

/** Cancels the unfinished jobs of a type (its photo was replaced or removed). */
export async function cancelPhotoJobs(tx: Tx, typeId: string): Promise<void> {
	await tx.photoJob.updateMany({
		where: { typeId, status: { in: ['PENDING', 'RUNNING'] } },
		data: { status: 'CANCELLED' }
	});
}

/** Takes the next due job and marks it running, or returns null. */
export async function claimPhotoJob(): Promise<ClaimedJob | null> {
	const rows = await db.$queryRaw<ClaimedJob[]>`
		UPDATE "PhotoJob" SET status = 'RUNNING', "startedAt" = now(), attempts = attempts + 1,
			"updatedAt" = now()
		WHERE id = (
			SELECT id FROM "PhotoJob" WHERE status = 'PENDING' AND "runAfter" <= now()
			ORDER BY priority DESC, "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
		)
		RETURNING id, "typeId", "sourceKey", stage, attempts`;
	return rows[0] ?? null;
}

/** Puts jobs lost by a stopped worker back into the queue. */
export async function requeueStalePhotoJobs(now = new Date()): Promise<number> {
	const { count } = await db.photoJob.updateMany({
		where: { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
		data: { status: 'PENDING' }
	});
	return count;
}

/** Ends a running job; does nothing when it was cancelled meanwhile. */
async function finish(id: string, data: Parameters<typeof db.photoJob.updateMany>[0]['data']) {
	await db.photoJob.updateMany({ where: { id, status: 'RUNNING' }, data });
}

export const photoJobDone = (id: string) => finish(id, { status: 'DONE', error: null });

export const photoJobCancelled = (id: string) => finish(id, { status: 'CANCELLED' });

/** A failed attempt: retried after a pause, or failed for good after MAX_ATTEMPTS. */
export function photoJobFailed(job: ClaimedJob, error: string, retry = true) {
	const delay = RETRY_DELAYS_MS[job.attempts - 1];
	if (!retry || delay === undefined) return finish(job.id, { status: 'FAILED', error });
	return finish(job.id, { status: 'PENDING', error, runAfter: new Date(Date.now() + delay) });
}

/** The processor was unreachable: try again later, the attempt does not count. */
export function photoJobPostponed(job: ClaimedJob, error: string) {
	return finish(job.id, {
		status: 'PENDING',
		error,
		attempts: { decrement: 1 },
		runAfter: new Date(Date.now() + UNAVAILABLE_DELAY_MS)
	});
}

/**
 * Queues the cutout of every photo that has none and no job for its current
 * source yet: old photos are processed as soon as processing is turned on, and
 * a restart adds nothing twice. Returns the number of jobs queued.
 */
export async function backfillPhotoJobs(): Promise<number> {
	const types = await db.itemType.findMany({
		where: { photoOriginalKey: { not: null }, photoCutoutKey: null },
		select: {
			id: true,
			photoSourceKey: true,
			photoOriginalKey: true,
			photoJobs: { where: { status: { not: 'CANCELLED' } }, select: { sourceKey: true } }
		}
	});
	let queued = 0;
	for (const type of types) {
		const source = sourceOf(type);
		if (!source) continue;
		if (type.photoJobs.some((j) => j.sourceKey === source)) continue;
		await db.photoJob.create({ data: { typeId: type.id, sourceKey: source, stage: 'CUTOUT' } });
		queued++;
	}
	return queued;
}
