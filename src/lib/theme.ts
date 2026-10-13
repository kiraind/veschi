import { THEME_COOKIE, isDarkTheme, type Theme } from '$lib/domain/theme';

/** Saves the theme for this browser and applies it at once. */
export function setTheme(theme: Theme): void {
	document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
	const root = document.documentElement;
	root.dataset.theme = theme;
	const dark = isDarkTheme(theme, matchMedia('(prefers-color-scheme: dark)').matches);
	root.classList.toggle('dark', dark);
	// The system bar takes the page background, as in app.html.
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', dark ? '#101828' : '#f9fafb');
}
