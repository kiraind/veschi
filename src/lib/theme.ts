import {
	BACKGROUND_DARK,
	BACKGROUND_LIGHT,
	SCHEME_COOKIE,
	THEME_COOKIE,
	isDarkTheme,
	type Theme
} from '$lib/domain/theme';

const YEAR = 60 * 60 * 24 * 400;

/** Saves the theme for this browser and applies it at once. */
export function setTheme(theme: Theme): void {
	document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${YEAR}; samesite=lax`;
	const root = document.documentElement;
	root.dataset.theme = theme;
	const dark = isDarkTheme(theme, matchMedia('(prefers-color-scheme: dark)').matches);
	root.classList.toggle('dark', dark);
	// The system bar takes the page background, and the manifest learns the scheme, as in app.html.
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', dark ? BACKGROUND_DARK : BACKGROUND_LIGHT);
	document.cookie = `${SCHEME_COOKIE}=${dark ? 'dark' : 'light'}; path=/; max-age=${YEAR}; samesite=lax`;
}
