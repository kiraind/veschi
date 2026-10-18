import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { S3Storage } from './s3';

// Runs against a real MinIO when S3_TEST_ENDPOINT is set (CI starts one).
const endpoint = process.env.S3_TEST_ENDPOINT;

describe.skipIf(!endpoint)('S3Storage', () => {
	const storage = (bucket: string) =>
		new S3Storage({
			endpoint: endpoint!,
			accessKey: process.env.S3_TEST_ACCESS_KEY ?? 'veschi',
			secretKey: process.env.S3_TEST_SECRET_KEY ?? 'veschi-secret',
			bucket,
			region: 'us-east-1'
		});

	it('creates the bucket once, stores, reads and deletes objects', async () => {
		const s3 = storage(`veschi-test-${Date.now()}`);
		await s3.ensureBucket();
		await s3.ensureBucket();

		const data = Buffer.from('фото 📷 '.repeat(1000));
		const key = 'photos/ab cd/тип+1 (копия).webp';
		await s3.put(key, data, 'image/webp');
		const stored = await s3.get(key);
		expect(stored).toMatchObject({ size: data.length, contentType: 'image/webp' });
		expect((await buffer(stored!.body)).equals(data)).toBe(true);

		await s3.delete(key);
		expect(await s3.get(key)).toBeNull();
		await s3.delete(key);
		expect(await s3.get('photos/missing')).toBeNull();
	});

	it('reports wrong credentials', async () => {
		const s3 = new S3Storage({
			endpoint: endpoint!,
			accessKey: 'veschi',
			secretKey: 'wrong',
			bucket: 'veschi-test',
			region: 'us-east-1'
		});
		await expect(s3.put('x', Buffer.from('x'), 'text/plain')).rejects.toThrow(
			/S3 PUT x failed: 403 SignatureDoesNotMatch/
		);
	});
});
