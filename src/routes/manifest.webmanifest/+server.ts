import { json } from '@sveltejs/kit';
import {
	BACKGROUND_DARK,
	BACKGROUND_LIGHT,
	SCHEME_COOKIE,
	THEME_COOKIE,
	isDarkManifest,
	parseTheme
} from '$lib/domain/theme';
import type { RequestHandler } from './$types';

/**
 * Web app manifest. Its colors follow the theme from «Настройки»: Firefox on Android
 * paints the status bar of the installed app with theme_color and ignores the
 * theme-color meta tag, so a fixed light color gave a white bar over a dark app.
 * It reads the theme cookies (app.html links it with crossorigin="use-credentials").
 */
export const GET: RequestHandler = ({ cookies }) => {
	const dark = isDarkManifest(parseTheme(cookies.get(THEME_COOKIE)), cookies.get(SCHEME_COOKIE));
	const color = dark ? BACKGROUND_DARK : BACKGROUND_LIGHT;
	return json(
		{
			name: 'veschi',
			short_name: 'veschi',
			description: 'Где лежит каждая вещь: каталог, наклейки с QR и рабочие столы',
			lang: 'ru',
			id: '/',
			start_url: '/',
			scope: '/',
			display: 'standalone',
			orientation: 'portrait',
			theme_color: color,
			background_color: color,
			shortcuts: [
				{ name: 'Сканировать наклейку', short_name: 'Скан', url: '/scan' },
				{ name: 'Рабочий стол', short_name: 'Стол', url: '/workbench' }
			],
			icons: [
				{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
				{
					src: '/icons/maskable-512.png',
					sizes: '512x512',
					type: 'image/png',
					purpose: 'maskable'
				},
				{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
			]
		},
		{
			headers: {
				'content-type': 'application/manifest+json',
				// Depends on cookies: never reuse a copy made for the other theme.
				'cache-control': 'no-cache',
				vary: 'cookie'
			}
		}
	);
};
