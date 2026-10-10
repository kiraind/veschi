import { text } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Liveness and readiness probe: checks the database connection. */
export const GET: RequestHandler = async () => {
	try {
		await db.$queryRaw`SELECT 1`;
		return text('ok');
	} catch {
		return text('database unavailable', { status: 503 });
	}
};
