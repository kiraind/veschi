import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { authorization, EMPTY_SHA256, sha256Hex, uriEncode } from './sigv4';
import type { Storage, StoredObject } from './types';

export interface S3Options {
	endpoint: string;
	accessKey: string;
	secretKey: string;
	bucket: string;
	region: string;
}

/**
 * MinIO / S3 storage. Objects are private; the app streams them to signed-in users.
 * A small client on fetch with Signature V4 and path-style URLs: the app needs only
 * five calls, and the minio package with its dependencies weighed ~11 MB.
 */
export class S3Storage implements Storage {
	private readonly endpoint: URL;

	constructor(private readonly options: S3Options) {
		this.endpoint = new URL(options.endpoint);
	}

	async ensureBucket(): Promise<void> {
		const head = await this.request('HEAD', '');
		if (head.ok) return;
		if (head.status !== 404) throw await s3Error('HEAD', '', head);
		// Outside us-east-1, S3 needs the region in the body to create a bucket there.
		const body =
			this.options.region === 'us-east-1'
				? undefined
				: Buffer.from(
						'<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
							`<LocationConstraint>${this.options.region}</LocationConstraint>` +
							'</CreateBucketConfiguration>'
					);
		const created = await this.request('PUT', '', body);
		// Another instance may have created it in between.
		if (!created.ok && (await errorCode(created)) !== 'BucketAlreadyOwnedByYou') {
			throw await s3Error('PUT', '', created);
		}
	}

	async put(key: string, data: Buffer, contentType: string): Promise<void> {
		const res = await this.request('PUT', key, data, { 'content-type': contentType });
		if (!res.ok) throw await s3Error('PUT', key, res);
		await res.body?.cancel();
	}

	async get(key: string): Promise<StoredObject | null> {
		const res = await this.request('GET', key);
		if (res.status === 404) {
			await res.body?.cancel();
			return null;
		}
		if (!res.ok || !res.body) throw await s3Error('GET', key, res);
		return {
			body: Readable.fromWeb(res.body as WebReadableStream),
			size: Number(res.headers.get('content-length')),
			contentType: res.headers.get('content-type') ?? 'application/octet-stream'
		};
	}

	async delete(key: string): Promise<void> {
		const res = await this.request('DELETE', key);
		// S3 answers 204 for a missing key too; MinIO may answer 404.
		if (!res.ok && res.status !== 404) throw await s3Error('DELETE', key, res);
		await res.body?.cancel();
	}

	/** A signed request to the bucket (key '') or an object in it. */
	private request(
		method: string,
		key: string,
		body?: Buffer,
		extraHeaders: Record<string, string> = {}
	): Promise<Response> {
		const path = [this.options.bucket, ...(key ? key.split('/') : [])].map(uriEncode).join('/');
		const base = this.endpoint.pathname.replace(/\/$/, '');
		const url = new URL(`${base}/${path}`, this.endpoint);
		const headers: Record<string, string> = {
			...extraHeaders,
			host: url.host,
			'x-amz-content-sha256': body ? sha256Hex(body) : EMPTY_SHA256,
			'x-amz-date': new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
		};
		const { accessKey, secretKey, region } = this.options;
		headers.authorization = authorization({ method, url, headers, accessKey, secretKey, region });
		delete headers.host; // fetch sets it itself
		return fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
	}
}

async function errorCode(res: Response): Promise<string | undefined> {
	const text = await res.text().catch(() => '');
	return /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
}

async function s3Error(method: string, key: string, res: Response): Promise<Error> {
	const code = await errorCode(res);
	return new Error(
		`S3 ${method} ${key || '(bucket)'} failed: ${res.status}${code ? ` ${code}` : ''}`
	);
}
