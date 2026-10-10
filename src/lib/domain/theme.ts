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
