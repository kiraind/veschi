<script lang="ts">
	import { onMount } from 'svelte';
	import { navigating } from '$app/state';
	import { Spinner } from 'flowbite-svelte';
	import { CheckCircleOutline, ExclamationCircleOutline } from 'flowbite-svelte-icons';
	import { connection } from '$lib/connection.svelte';
	import { offlineCopyText } from '$lib/domain/offline';

	/**
	 * A notice at the top of the screen when the server can't be reached or answers
	 * slowly, so a page that doesn't open or a change that doesn't save has a visible
	 * reason. At the top, not the bottom: the search field sits right above the tab bar.
	 */
	let { belowNavbar }: { belowNavbar: boolean } = $props();

	/** A page or a request taking longer than this counts as slow. */
	const SLOW_MS = 3000;
	const RESTORED_MS = 3000;

	/** Set when the service worker served its saved copy of this page (see service-worker.ts). */
	let offlineCopy = $state<string | null>(null);
	let slow = $state(false);

	onMount(() => {
		offlineCopy = document.documentElement.dataset.offlineCopy ?? null;
		// A saved copy means the server did not answer: keep checking until it does.
		if (offlineCopy !== null) {
			connection.failed();
			void connection.recheck();
		}
	});

	const busy = $derived(navigating.to !== null || connection.pending > 0);
	$effect(() => {
		if (!busy) {
			slow = false;
			return;
		}
		const timer = setTimeout(() => (slow = true), SLOW_MS);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!connection.restored) return;
		const timer = setTimeout(() => (connection.restored = false), RESTORED_MS);
		return () => clearTimeout(timer);
	});

	type Notice = { tone: 'error' | 'wait' | 'ok'; text: string; action?: 'reload' | 'retry' };

	const notice: Notice | null = $derived.by(() => {
		if (offlineCopy !== null) {
			return connection.unreachable || !connection.online
				? { tone: 'error', text: offlineCopyText(offlineCopy), action: 'reload' }
				: { tone: 'ok', text: 'Связь с сервером вернулась', action: 'reload' };
		}
		if (!connection.online) {
			return { tone: 'error', text: 'Нет интернета: изменения не сохранятся, пока он не появится' };
		}
		if (connection.unreachable) {
			return {
				tone: 'error',
				text: 'Сервер не отвечает: изменения не сохранятся. Проверяю связь…',
				action: 'retry'
			};
		}
		if (slow) return { tone: 'wait', text: 'Сервер отвечает долго…' };
		if (connection.restored) return { tone: 'ok', text: 'Связь с сервером восстановлена' };
		return null;
	});

	const toneClass = {
		error:
			'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
		wait: 'border-gray-200 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
		ok: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
	};
</script>

{#if notice}
	<div
		class="pointer-events-none fixed inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 flex justify-center px-3 {belowNavbar
			? 'md:top-[4.5rem]'
			: ''}"
	>
		<div
			class="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-xl border px-3 py-2 text-sm shadow-lg {toneClass[
				notice.tone
			]}"
			role={notice.tone === 'error' ? 'alert' : 'status'}
		>
			{#if notice.tone === 'wait'}
				<Spinner size="5" class="flex-none" />
			{:else if notice.tone === 'ok'}
				<CheckCircleOutline class="h-5 w-5 flex-none" />
			{:else}
				<ExclamationCircleOutline class="h-5 w-5 flex-none" />
			{/if}
			<span class="min-w-0 flex-1">{notice.text}</span>
			{#if notice.action}
				<button
					type="button"
					class="min-h-9 flex-none rounded-lg px-3 font-medium underline-offset-2 hover:underline"
					onclick={() =>
						notice.action === 'reload' ? location.reload() : void connection.recheck()}
				>
					{notice.action === 'reload' ? 'Обновить' : 'Повторить'}
				</button>
			{/if}
		</div>
	</div>
{/if}
