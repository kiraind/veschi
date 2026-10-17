import { env } from '$env/dynamic/private';
import { z } from 'zod';

const schema = z.object({
	DATABASE_URL: z.string().min(1),
	ORIGIN: z.string().url().optional(),
	QR_BASE_URL: z.string().url().optional(),
	S3_ENDPOINT: z.string().url().optional(),
	S3_ACCESS_KEY: z.string().optional(),
	S3_SECRET_KEY: z.string().optional(),
	S3_BUCKET: z.string().default('veschi'),
	S3_REGION: z.string().default('us-east-1'),
	ADMIN_LOGIN: z.string().optional(),
	ADMIN_PASSWORD: z.string().optional(),
	ADMIN_NAME: z.string().optional(),
	ADMIN_RESET_PASSWORD: z
		.string()
		.optional()
		.transform((v) => v === '1' || v === 'true'),
	// Photo processing on a ComfyUI server (src/lib/server/photos): off, or the
	// cutout of the background. Any ComfyUI with the ComfyUI-RMBG nodes works:
	// our photo-processor image or Comfy Cloud (with an API key).
	PHOTO_PROCESSING: z.enum(['off', 'cutout']).default('off'),
	PHOTO_PROCESSOR_URL: z.string().url().optional(),
	PHOTO_PROCESSOR_API_KEY: z.string().min(1).optional()
});

const refined = schema.refine((c) => c.PHOTO_PROCESSING === 'off' || c.PHOTO_PROCESSOR_URL, {
	message: 'PHOTO_PROCESSING is on but PHOTO_PROCESSOR_URL is not set',
	path: ['PHOTO_PROCESSOR_URL']
});

/**
 * `qrBaseUrl` is null in production without ORIGIN and QR_BASE_URL: stickers
 * printed with a localhost link could never be fixed, so they are not printed.
 */
export type Config = z.infer<typeof schema> & { qrBaseUrl: string | null };

let cached: Config | null = null;

/** Validated server configuration from environment variables. */
export function config(): Config {
	if (cached) return cached;
	const parsed = refined.parse(env);
	const fallback = process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000';
	const qrBaseUrl = (parsed.QR_BASE_URL ?? parsed.ORIGIN ?? fallback)?.replace(/\/+$/, '') ?? null;
	cached = { ...parsed, qrBaseUrl };
	return cached;
}
