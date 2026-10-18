import { resolve } from 'node:path';
import { ensureAdminUser } from '$lib/server/auth/admin';
import { config } from '$lib/server/env';
import { migrate } from '$lib/server/migrate';
import { storage } from '$lib/server/storage';

/**
 * Startup tasks: apply database migrations, create the storage bucket and the
 * first user.
 */
export async function initApp(): Promise<void> {
	const c = config();
	await withRetry('database', async () => {
		await migrate(c.DATABASE_URL, resolve('prisma/migrations'));
	});
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
}

/** Retries a startup step with exponential backoff (PostgreSQL and MinIO may start later than the app). */
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
