import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	dismissToast,
	holdToast,
	releaseToast,
	toast,
	TOAST_ACTION_MS,
	TOAST_MS,
	toastState
} from './toast.svelte';

describe('toast', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		dismissToast();
		vi.useRealTimers();
	});

	it('shows one toast at a time and hides it after a while', () => {
		toast({ message: 'первый' });
		toast({ message: 'второй' });
		expect(toastState.current?.message).toBe('второй');
		vi.advanceTimersByTime(TOAST_MS - 1);
		expect(toastState.current).not.toBeNull();
		vi.advanceTimersByTime(1);
		expect(toastState.current).toBeNull();
	});

	it('keeps a toast with an action longer', () => {
		toast({ message: 'Выкинули', action: { label: 'Отменить', run: async () => {} } });
		vi.advanceTimersByTime(TOAST_MS);
		expect(toastState.current).not.toBeNull();
		vi.advanceTimersByTime(TOAST_ACTION_MS - TOAST_MS);
		expect(toastState.current).toBeNull();
	});

	it('does not close a newer toast by the id of an older one', () => {
		toast({ message: 'первый' });
		const first = toastState.current!.id;
		toast({ message: 'второй' });
		dismissToast(first);
		expect(toastState.current?.message).toBe('второй');
	});

	it('holds the toast while pointed at and counts again after', () => {
		toast({ message: 'держим' });
		holdToast();
		vi.advanceTimersByTime(TOAST_MS * 3);
		expect(toastState.current).not.toBeNull();
		releaseToast();
		vi.advanceTimersByTime(TOAST_MS);
		expect(toastState.current).toBeNull();
	});
});
