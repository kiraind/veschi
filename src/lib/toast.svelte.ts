/**
 * A short note after an action («2 штуки на столе «Дом»», «Выкинули «NE555»
 * · Отменить»): `toast({ message: … })`. Shown by `ToastHost`, rendered once
 * in the root layout, one at a time: a new toast replaces the one on screen.
 * It survives navigation, so it can follow an action that leaves the page.
 */

export interface ToastOptions {
	message: string;
	/** A link after the message, e.g. to the place the item went. */
	link?: { href: string; label: string };
	/** A button after the message, e.g. «Отменить». Runs once; the toast closes. */
	action?: { label: string; run: () => Promise<unknown> };
}

export interface Toast extends ToastOptions {
	id: number;
}

/** How long a toast stays: longer when it offers to undo. */
export const TOAST_MS = 4000;
export const TOAST_ACTION_MS = 7000;

export const toastState = $state<{ current: Toast | null }>({ current: null });

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(options: ToastOptions): void {
	clearTimeout(timer);
	const shown = { ...options, id: nextId++ };
	toastState.current = shown;
	timer = setTimeout(() => dismissToast(shown.id), options.action ? TOAST_ACTION_MS : TOAST_MS);
}

/** Closes the toast (only that one, when `id` is given and another has replaced it since). */
export function dismissToast(id?: number): void {
	if (id !== undefined && toastState.current?.id !== id) return;
	clearTimeout(timer);
	toastState.current = null;
}

/** Keeps the toast on screen while the pointer or focus is on it. */
export function holdToast(): void {
	clearTimeout(timer);
}

/** Starts the countdown again after `holdToast`. */
export function releaseToast(): void {
	const current = toastState.current;
	if (!current) return;
	clearTimeout(timer);
	timer = setTimeout(() => dismissToast(current.id), current.action ? TOAST_ACTION_MS : TOAST_MS);
}
