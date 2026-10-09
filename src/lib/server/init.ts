import { ensureAdminUser } from '$lib/server/auth/admin';
import { config } from '$lib/server/env';
import { storage } from '$lib/server/storage';

/**
 * Startup tasks: create the storage bucket and the first user. Database
 * migrations are applied before the server starts (see docker/entrypoint.sh).
 */
export async function initApp(): Promise<void> {
	const c = config();
	await storage().ensureBucket();
	const admin = await ensureAdminUser(c.ADMIN_LOGIN, c.ADMIN_PASSWORD, c.ADMIN_NAME);
	if (admin === 'created') console.info(`Created user "${c.ADMIN_LOGIN}" from ADMIN_LOGIN`);
	if (admin === 'updated') console.info(`Reset password of "${c.ADMIN_LOGIN}" from ADMIN_PASSWORD`);
}
