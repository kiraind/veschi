/**
 * In-app confirmation instead of the browser's `confirm()`:
 * `if (await confirmAction({ title: 'Удалить фото?' })) …`. The dialog itself
 * is `ConfirmHost`, rendered once in the root layout.
 */

export interface ConfirmOptions {
	/** The question, e.g. «Удалить фото?». */
	title: string;
	/** Optional consequences under the question. */
	message?: string;
	/** Label of the confirming button; «Удалить» by default. */
	confirmLabel?: string;
	/** null hides the cancel button (a notice with one button). */
	cancelLabel?: string | null;
	/** Red confirming button for destructive actions (default). */
	danger?: boolean;
}

interface Pending extends Required<Omit<ConfirmOptions, 'message' | 'cancelLabel'>> {
	message: string | null;
	cancelLabel: string | null;
	resolve: (ok: boolean) => void;
}

export const confirmState = $state<{ current: Pending | null }>({ current: null });

/** Asks in a modal; resolves true when confirmed, false when cancelled or dismissed. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
	// A new question cancels one still open.
	confirmState.current?.resolve(false);
	return new Promise((resolve) => {
		confirmState.current = {
			title: options.title,
			message: options.message ?? null,
			confirmLabel: options.confirmLabel ?? 'Удалить',
			cancelLabel: options.cancelLabel === undefined ? 'Отмена' : options.cancelLabel,
			danger: options.danger ?? true,
			resolve: (ok) => {
				confirmState.current = null;
				resolve(ok);
			}
		};
	});
}
