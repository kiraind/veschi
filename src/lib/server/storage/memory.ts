import { Readable } from 'node:stream';
import type { Storage, StoredObject } from './types';

/** In-memory storage for tests and for running without MinIO in development. */
export class MemoryStorage implements Storage {
	readonly objects = new Map<string, { data: Buffer; contentType: string }>();

	async ensureBucket(): Promise<void> {}

	async put(key: string, data: Buffer, contentType: string): Promise<void> {
		this.objects.set(key, { data, contentType });
	}

	async get(key: string): Promise<StoredObject | null> {
		const object = this.objects.get(key);
		if (!object) return null;
		return {
			body: Readable.from(object.data),
			size: object.data.length,
			contentType: object.contentType
		};
	}

	async delete(key: string): Promise<void> {
		this.objects.delete(key);
	}
}
