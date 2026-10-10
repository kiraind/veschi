import { THEME_COOKIE, isDarkTheme, parseTheme, type Theme } from '$lib/domain/theme';

/** The theme the page was rendered with (`<html data-theme>`). */
export function currentTheme(): Theme {
	return parseTheme(document.documentElement.dataset.theme);
}

/** Saves the theme for this browser and applies it at once. */
export function setTheme(theme: Theme): void {
	document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
	const root = document.documentElement;
	root.dataset.theme = theme;
	root.classList.toggle(
		'dark',
		isDarkTheme(theme, matchMedia('(prefers-color-scheme: dark)').matches)
	);
}
