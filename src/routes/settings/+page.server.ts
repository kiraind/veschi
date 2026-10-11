import { error } from '@sveltejs/kit';
import { THEME_COOKIE, parseTheme } from '$lib/domain/theme';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, cookies }) => {
	if (!locals.user) error(401, 'Нужно войти');
	// The theme of this browser, so the right button is pressed from the first render.
	return { profile: locals.user, theme: parseTheme(cookies.get(THEME_COOKIE)) };
};
