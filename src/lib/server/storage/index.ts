import { config } from '$lib/server/env';
import { MemoryStorage } from './memory';
import { S3Storage } from './s3';
import type { Storage } from './types';

export type { Storage, StoredObject } from './types';
export { MemoryStorage } from './memory';

let instance: Storage | null = null;

/**
 * The configured storage: MinIO/S3 when S3_ENDPOINT is set, otherwise an
 * in-memory store (development only; files are lost on restart).
 */
export function storage(): Storage {
	if (instance) return instance;
	const c = config();
	if (c.S3_ENDPOINT) {
		instance = new S3Storage({
			endpoint: c.S3_ENDPOINT,
			accessKey: c.S3_ACCESS_KEY ?? '',
			secretKey: c.S3_SECRET_KEY ?? '',
			bucket: c.S3_BUCKET,
			region: c.S3_REGION
		});
	} else {
		console.warn('S3_ENDPOINT is not set: files are kept in memory and lost on restart');
		instance = new MemoryStorage();
	}
	return instance;
}

/** Replaces the storage (tests). */
export function setStorage(next: Storage): void {
	instance = next;
}
