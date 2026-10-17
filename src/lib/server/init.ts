import { ensureAdminUser } from '$lib/server/auth/admin';
import { config } from '$lib/server/env';
import { storage } from '$lib/server/storage';
import { startPhotoWorker } from '$lib/server/photos/worker';

/**
 * Startup tasks: create the storage bucket and the first user, start the
 * photo processing worker (when PHOTO_PROCESSING is on). Database
 * migrations are applied before the server starts (see docker/entrypoint.sh).
 */
export async function initApp(): Promise<void> {
	const c = config();
	await withRetry('storage', () => storage().ensureBucket());
	const admin = await ensureAdminUser(
		c.ADMIN_LOGIN,
		c.ADMIN_PASSWORD,
		c.ADMIN_NAME,
		c.ADMIN_RESET_PASSWORD
	);
	if (admin === 'created') console.info(`Created user "${c.ADMIN_LOGIN}" from ADMIN_LOGIN`);
	if (admin === 'updated')
		console.info(`Reset password of "${c.ADMIN_LOGIN}" from ADMIN_PASSWORD (ADMIN_RESET_PASSWORD)`);
	startPhotoWorker();
}

/** Retries a startup step with exponential backoff (MinIO may start later than the app). */
async function withRetry(name: string, step: () => Promise<void>, attempts = 6): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await step();
		} catch (e) {
			if (attempt >= attempts) throw e;
			const delayMs = 500 * 2 ** (attempt - 1);
			console.warn(
				`${name} is not ready (attempt ${attempt}/${attempts}), retrying in ${delayMs} ms`
			);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
}
