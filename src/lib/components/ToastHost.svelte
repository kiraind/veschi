<script lang="ts">
	import { fly } from 'svelte/transition';
	import { CloseOutline } from 'flowbite-svelte-icons';
	import { errorText } from '$lib/api';
	import { dismissToast, holdToast, releaseToast, toast, toastState } from '$lib/toast.svelte';

	/**
	 * Shows the toast from `toast()` at the bottom of the screen: above the tab
	 * bar on phones (`aboveTabBar`), bottom left on wide screens.
	 */
	let { aboveTabBar = false }: { aboveTabBar?: boolean } = $props();

	let busy = $state(false);

	async function act() {
		const current = toastState.current;
		if (!current?.action || busy) return;
		busy = true;
		try {
			await current.action.run();
			dismissToast(current.id);
		} catch (e) {
			toast({ message: errorText(e) });
		} finally {
			busy = false;
		}
	}
</script>

<div
	class="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 md:start-6 md:end-auto md:bottom-6 md:justify-start md:px-0 {aboveTabBar
		? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]'
		: 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'}"
	role="status"
	aria-live="polite"
>
	{#if toastState.current}
		{@const current = toastState.current}
		{#key current.id}
			<div
				class="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-xl md:w-auto md:min-w-80 bg-gray-800 py-1.5 ps-4 pe-1.5 text-sm text-white shadow-lg ring-1 ring-black/5 dark:bg-gray-600 dark:ring-white/10"
				role="group"
				aria-label="Уведомление"
				transition:fly={{ y: 16, duration: 180 }}
				onpointerenter={holdToast}
				onpointerleave={releaseToast}
				onfocusin={holdToast}
				onfocusout={releaseToast}
			>
				<p class="min-w-0 flex-1 py-1.5 wrap-anywhere">{current.message}</p>
				{#if current.link}
					<a
						href={current.link.href}
						class="flex min-h-9 flex-none items-center rounded-lg px-2.5 font-semibold text-primary-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none"
						onclick={() => dismissToast(current.id)}>{current.link.label}</a
					>
				{/if}
				{#if current.action}
					<button
						type="button"
						class="flex min-h-9 flex-none items-center rounded-lg px-2.5 font-semibold text-primary-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none disabled:opacity-60"
						disabled={busy}
						onclick={act}>{current.action.label}</button
					>
				{/if}
				<button
					type="button"
					class="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-gray-300 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:outline-none"
					aria-label="Закрыть"
					onclick={() => dismissToast(current.id)}
				>
					<CloseOutline class="h-4 w-4" />
				</button>
			</div>
		{/key}
	{/if}
</div>
