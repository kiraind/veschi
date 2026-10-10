import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The top-level list moved to «Контейнеры». */
export const GET: RequestHandler = () => redirect(308, '/containers');
