import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '$lib/server/errors';
import { S3Storage } from './s3';

let server: Server | null = null;

afterEach(() => {
	server?.close();
	server = null;
	vi.restoreAllMocks();
});

/** An S3 endpoint that answers every request with the given response. */
async function storageAnswering(
	status: number,
	headers: Record<string, string>,
	body: string
): Promise<S3Storage> {
	server = createServer((req, res) => {
		req.resume();
		req.on('end', () => res.writeHead(status, headers).end(body));
	});
	await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	return new S3Storage({
		endpoint: `http://127.0.0.1:${port}`,
		accessKey: 'veschi',
		secretKey: 'veschi-secret',
		bucket: 'veschi',
		region: 'us-east-1'
	});
}

describe('S3Storage.put', () => {
	it('turns a proxy 413 page into a message for the user and logs what the proxy said', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const s3 = await storageAnswering(
			413,
			{ 'content-type': 'text/html', server: 'nginx/1.24.0' },
			'<html><head><title>413 Request Entity Too Large</title></head><body></body></html>'
		);
		const failure = s3.put('params/u/f', Buffer.from('pdf'), 'application/pdf');
		await expect(failure).rejects.toBeInstanceOf(AppError);
		await expect(failure).rejects.toMatchObject({ status: 413, code: 'too_large' });
		expect(String(log.mock.calls[0]?.[0])).toBe(
			'Error: S3 PUT params/u/f failed: 413 nginx/1.24.0: 413 Request Entity Too Large'
		);
	});

	it('names the S3 error code and message', async () => {
		const s3 = await storageAnswering(
			400,
			{ 'content-type': 'application/xml', server: 'MinIO' },
			'<?xml version="1.0" encoding="UTF-8"?><Error><Code>EntityTooLarge</Code>' +
				'<Message>Your proposed upload exceeds the maximum allowed object size.</Message></Error>'
		);
		await expect(s3.put('params/u/f', Buffer.from('x'), 'text/plain')).rejects.toThrow(
			'S3 PUT params/u/f failed: 400 EntityTooLarge: Your proposed upload exceeds the maximum allowed object size.'
		);
	});

	it('sends the body with its content type', async () => {
		let received: { method?: string; type?: string; body?: string } = {};
		server = createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on('data', (c: Buffer) => chunks.push(c));
			req.on('end', () => {
				received = {
					method: req.method,
					type: req.headers['content-type'],
					body: Buffer.concat(chunks).toString()
				};
				res.writeHead(200).end();
			});
		});
		await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;
		const s3 = new S3Storage({
			endpoint: `http://127.0.0.1:${port}`,
			accessKey: 'veschi',
			secretKey: 'veschi-secret',
			bucket: 'veschi',
			region: 'us-east-1'
		});
		await s3.put('params/u/f', Buffer.from('инструкция'), 'application/pdf');
		expect(received).toEqual({ method: 'PUT', type: 'application/pdf', body: 'инструкция' });
	});
});
