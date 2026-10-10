import { Client, S3Error } from 'minio';
import type { Storage, StoredObject } from './types';

export interface S3Options {
	endpoint: string;
	accessKey: string;
	secretKey: string;
	bucket: string;
	region: string;
}

/** MinIO / S3 storage. Objects are private; the app streams them to signed-in users. */
export class S3Storage implements Storage {
	private readonly client: Client;
	private readonly bucket: string;
	private readonly region: string;

	constructor(options: S3Options) {
		const url = new URL(options.endpoint);
		const useSSL = url.protocol === 'https:';
		this.client = new Client({
			endPoint: url.hostname,
			port: url.port ? Number(url.port) : useSSL ? 443 : 80,
			useSSL,
			accessKey: options.accessKey,
			secretKey: options.secretKey,
			region: options.region,
			pathStyle: true
		});
		this.bucket = options.bucket;
		this.region = options.region;
	}

	async ensureBucket(): Promise<void> {
		if (!(await this.client.bucketExists(this.bucket))) {
			await this.client.makeBucket(this.bucket, this.region);
		}
	}

	async put(key: string, data: Buffer, contentType: string): Promise<void> {
		await this.client.putObject(this.bucket, key, data, data.length, {
			'Content-Type': contentType
		});
	}

	async get(key: string): Promise<StoredObject | null> {
		try {
			const stat = await this.client.statObject(this.bucket, key);
			const body = await this.client.getObject(this.bucket, key);
			return {
				body,
				size: stat.size,
				contentType: String(stat.metaData['content-type'] ?? 'application/octet-stream')
			};
		} catch (e) {
			if (e instanceof S3Error && (e.code === 'NoSuchKey' || e.code === 'NotFound')) return null;
			throw e;
		}
	}

	async delete(key: string): Promise<void> {
		await this.client.removeObject(this.bucket, key);
	}
}
