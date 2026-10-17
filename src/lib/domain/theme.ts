/**
 * App theme chosen in «Настройки». It belongs to the device (browser), not to the
 * account: it lives in a cookie so the server renders the page with it and nothing
 * flashes. «system» follows the device's light / dark setting.
 */
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = 'theme';

/** Cookie value → theme; anything unknown or missing is «system». */
export function parseTheme(value: string | null | undefined): Theme {
	return (THEMES as readonly string[]).includes(value ?? '') ? (value as Theme) : 'system';
}

/** Whether the dark styles apply for a theme, given the device setting. */
export function isDarkTheme(theme: Theme, systemDark: boolean): boolean {
	return theme === 'dark' || (theme === 'system' && systemDark);
}

/**
 * Light / dark actually shown on this device, saved by the page (app.html). The
 * manifest is fetched without running any script, so for «system» this cookie is
 * the only way it learns what the device uses.
 */
export const SCHEME_COOKIE = 'scheme';

/** Page background (gray-50 / gray-900), also the color of the system bars. */
export const BACKGROUND_LIGHT = '#f9fafb';
export const BACKGROUND_DARK = '#101828';

/** Whether the manifest should be dark: the chosen theme, or the scheme the page last saw. */
export function isDarkManifest(theme: Theme, scheme: string | null | undefined): boolean {
	return isDarkTheme(theme, scheme === 'dark');
}
