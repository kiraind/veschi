import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** «Справочники» became the «Выпадающие списки» section of «Параметры». */
export const load: PageServerLoad = () => redirect(308, '/params#lists');
