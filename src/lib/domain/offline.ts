/**
 * What the app shows when the server can't be reached. Shared by the service
 * worker (saved page copies, the «Нет связи» page) and the page-side notice.
 */
import { formatIsoDateTime } from './dates';

/** Statuses a reverse proxy answers with when the app behind it is down or hangs. */
export function isGatewayStatus(status: number): boolean {
	return status === 502 || status === 503 || status === 504;
}

/**
 * Marks a saved page copy served without a network: `<html data-offline-copy="…">`
 * with the time the copy was saved (ISO), read by ConnectionNotice.
 */
export function markOfflineCopy(html: string, savedAt: Date): string {
	const time = Number.isNaN(savedAt.getTime()) ? '' : savedAt.toISOString();
	return html.replace(/<html\b/i, `<html data-offline-copy="${time}"`);
}

/** The notice on a saved page copy; `savedAt` is the ISO time from the marker (may be empty). */
export function offlineCopyText(savedAt: string): string {
	const date = new Date(savedAt);
	const when = savedAt && !Number.isNaN(date.getTime()) ? ` от ${formatIsoDateTime(date)}` : '';
	return `Сервер недоступен: это сохранённая копия страницы${when}, изменения не сохранятся`;
}

/**
 * Why a page could not be opened: `network` — the request did not reach the
 * server; `timeout` — the server did not answer in time; `down` — the proxy in
 * front of the app said the app is down (502/503/504).
 */
export type OfflineReason = 'network' | 'timeout' | 'down';

/** What the proxy answered instead of the page (reason `down`), shown so the cause can be found. */
export interface GatewayAnswer {
	status: number;
	statusText: string;
	/** The `server` header: which proxy answered (nginx, Caddy, cloudflare…). */
	server: string | null;
	/** The text of its error page, without markup. */
	body: string;
}

/** Longest part of the proxy's error page text shown on the «Сервер недоступен» page. */
const GATEWAY_BODY_MAX = 300;

/** Plain text of an error page: no tags, styles or scripts, spaces collapsed, cut to a few lines. */
export function errorPageText(html: string): string {
	const text = html
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > GATEWAY_BODY_MAX ? `${text.slice(0, GATEWAY_BODY_MAX)}…` : text;
}

function escapeHtml(text: string): string {
	return text.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);
}

/** The line about the proxy's answer: «Ответ 503 Service Unavailable от nginx: …». */
export function gatewayAnswerText({ status, statusText, server, body }: GatewayAnswer): string {
	const from = server ? ` от ${server}` : '';
	return `Ответ ${[status, statusText].filter(Boolean).join(' ')}${from}${body ? `: ${body}` : ''}`;
}

/** How often the «Нет связи» page asks /healthz whether the server is back. */
export const OFFLINE_RECHECK_MS = 5000;

const reasonText: Record<OfflineReason, { title: string; text: string }> = {
	network: {
		title: 'Нет связи с сервером',
		text: 'Страница не загрузилась: нет интернета или сервер выключен. Эта страница ещё не открывалась на этом устройстве, поэтому сохранённой копии нет.'
	},
	timeout: {
		title: 'Сервер долго не отвечает',
		text: 'Страница не загрузилась за отведённое время. Возможно, сервер перегружен или связь очень медленная.'
	},
	down: {
		title: 'Сервер недоступен',
		text: 'Приложение на сервере сейчас не работает (перезапускается или упало). Обычно это ненадолго.'
	}
};

/**
 * A self-contained page (no app scripts or styles) for a navigation that failed.
 * Unless the server was merely slow, it reloads by itself once /healthz answers
 * (asked every OFFLINE_RECHECK_MS and on the «online» event).
 */
export function offlinePage(reason: OfflineReason, answer?: GatewayAnswer): string {
	const { title, text } = reasonText[reason];
	const answerLine = answer
		? `\n\t<p class="answer">${escapeHtml(gatewayAnswerText(answer))}</p>`
		: '';
	// After a timeout the server may be up but slow: reloading by itself could loop.
	const auto = reason !== 'timeout';
	return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${title} — veschi</title>
<style>
	:root { color-scheme: light dark; --bg: #f9fafb; --card: #fff; --text: #111827; --muted: #6b7280; --border: #e5e7eb; --accent: #1d4ed8; --accent-text: #fff; --danger: #dc2626; }
	@media (prefers-color-scheme: dark) {
		:root { --bg: #111827; --card: #1f2937; --text: #f3f4f6; --muted: #9ca3af; --border: #374151; --accent: #2563eb; --danger: #f87171; }
	}
	* { box-sizing: border-box; }
	body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: max(1.5rem, env(safe-area-inset-top)) 1rem max(1.5rem, env(safe-area-inset-bottom)); background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
	main { width: 100%; max-width: 24rem; background: var(--card); border: 1px solid var(--border); border-radius: 1rem; padding: 1.5rem; text-align: center; }
	svg { width: 3rem; height: 3rem; color: var(--danger); }
	h1 { font-size: 1.25rem; margin: 0.75rem 0 0.5rem; }
	p { color: var(--muted); line-height: 1.5; margin: 0 0 1rem; }
	button { width: 100%; min-height: 2.75rem; border: 0; border-radius: 0.5rem; background: var(--accent); color: var(--accent-text); font: inherit; font-weight: 500; cursor: pointer; }
	button:disabled { opacity: 0.7; }
	.status { font-size: 0.875rem; margin: 0.75rem 0 0; }
	.answer { font-size: 0.75rem; overflow-wrap: anywhere; }
	a { color: var(--accent); }
</style>
</head>
<body>
<main>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.7M16.8 11.3A10 10 0 0 1 19 12.9M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg>
	<h1>${title}</h1>
	<p>${text}</p>${answerLine}
	<button type="button" id="retry">Повторить</button>
	<p class="status" id="status">${auto ? 'Страница откроется сама, когда сервер ответит.' : ''}</p>
</main>
<script>
	(function () {
		var retry = document.getElementById('retry');
		var status = document.getElementById('status');
		var timer;
		function check() {
			clearTimeout(timer);
			fetch('/healthz', { cache: 'no-store' })
				.then(function (r) { if (r.ok) location.reload(); else throw 0; })
				.catch(function () { timer = setTimeout(check, ${OFFLINE_RECHECK_MS}); });
		}
		retry.addEventListener('click', function () {
			retry.disabled = true;
			status.textContent = 'Проверяю связь…';
			location.reload();
		});
		if (!navigator.onLine) status.textContent = 'Устройство не в сети. Страница откроется сама, когда связь появится.';
		if (${auto} || !navigator.onLine) {
			window.addEventListener('online', check);
			timer = setTimeout(check, ${OFFLINE_RECHECK_MS});
		}
	})();
</script>
</body>
</html>`;
}
