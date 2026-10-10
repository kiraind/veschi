import type { Readable } from 'node:stream';

export interface StoredObject {
	body: Readable;
	size: number;
	contentType: string;
}

/** Object storage for photos and file parameters (MinIO/S3 in production). */
export interface Storage {
	ensureBucket(): Promise<void>;
	put(key: string, data: Buffer, contentType: string): Promise<void>;
	/** Returns null when the object does not exist. */
	get(key: string): Promise<StoredObject | null>;
	delete(key: string): Promise<void>;
}
