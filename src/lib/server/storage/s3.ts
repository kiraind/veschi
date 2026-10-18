import type { IncomingMessage } from 'node:http';
import { Client, S3Error } from 'minio';
import { AppError } from '$lib/server/errors';
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
		// A presigned URL and fetch instead of putObject: when a proxy in front of MinIO
		// rejects the upload with its own HTML page (nginx's 413 for a body over
		// client_max_body_size), minio throws an S3Error without status, code or message.
		const url = await this.client.presignedPutObject(this.bucket, key, 60);
		const res = await fetch(url, {
			method: 'PUT',
			headers: { 'content-type': contentType },
			body: new Uint8Array(data)
		});
		if (res.ok) {
			await res.body?.cancel();
			return;
		}
		const failure = await s3Error('PUT', key, res);
		if (res.status === 413) {
			console.error(failure);
			throw new AppError(
				413,
				'too_large',
				'Хранилище файлов не приняло такой большой файл. Если перед MinIO стоит nginx, увеличьте в нём client_max_body_size'
			);
		}
		throw failure;
	}

	async get(key: string): Promise<StoredObject | null> {
		try {
			// minio returns the HTTP response itself: its headers carry the size and type,
			// so no separate statObject round trip is needed.
			const body = (await this.client.getObject(this.bucket, key)) as IncomingMessage;
			const length = Number(body.headers['content-length']);
			const size = Number.isFinite(length)
				? length
				: (await this.client.statObject(this.bucket, key)).size;
			return {
				body,
				size,
				contentType: body.headers['content-type'] ?? 'application/octet-stream'
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

/**
 * A readable error for a failed S3 request: status, the S3 error code and message,
 * or, for a page from a proxy instead of S3, its title and Server header.
 */
async function s3Error(method: string, key: string, res: Response): Promise<Error> {
	const text = await res.text().catch(() => '');
	const tag = (name: string) =>
		new RegExp(`<${name}>([^<]*)</${name}>`, 'i').exec(text)?.[1]?.trim();
	const code = tag('Code');
	const detail = code
		? `${code}: ${tag('Message') ?? ''}`
		: [res.headers.get('server'), tag('title')].filter(Boolean).join(': ');
	return new Error(`S3 ${method} ${key} failed: ${res.status}${detail ? ` ${detail}` : ''}`);
}
