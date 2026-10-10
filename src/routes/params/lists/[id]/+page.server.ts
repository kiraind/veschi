import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Drop-down lists are now part of their parameters («Параметры»). */
export const load: PageServerLoad = () => redirect(308, '/params');
