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
	ADMIN_NAME: z.string().optional()
});

export type Config = z.infer<typeof schema> & { qrBaseUrl: string };

let cached: Config | null = null;

/** Validated server configuration from environment variables. */
export function config(): Config {
	if (cached) return cached;
	const parsed = schema.parse(env);
	const qrBaseUrl = (parsed.QR_BASE_URL ?? parsed.ORIGIN ?? 'http://localhost:3000').replace(
		/\/+$/,
		''
	);
	cached = { ...parsed, qrBaseUrl };
	return cached;
}
