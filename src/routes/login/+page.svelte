<script lang="ts">
	import RequiredMark from '$lib/components/RequiredMark.svelte';
	import { enhance } from '$app/forms';
	import { connection } from '$lib/connection.svelte';
	import { Button, Card, Input, Label } from 'flowbite-svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	/** The sign-in did not reach the server: say so here instead of the error page. */
	let offlineMessage = $state<string | null>(null);
	const message = $derived(offlineMessage ?? form?.message);
</script>

<svelte:head><title>Вход — Вещи</title></svelte:head>

<div class="flex min-h-[70vh] items-center justify-center">
	<Card class="w-full max-w-sm p-6">
		<h1 class="mb-4 text-center text-2xl font-bold">Вещи</h1>
		<form
			method="POST"
			use:enhance={() => {
				offlineMessage = null;
				return async ({ result, update }) => {
					// No status: the request failed or the answer was not the app's (proxy page).
					if (result.type === 'error' && result.status === undefined) {
						connection.failed();
						offlineMessage = 'Нет связи с сервером, попробуйте ещё раз';
					} else {
						await update();
					}
				};
			}}
			class="flex flex-col gap-4"
		>
			<Label>
				Логин<RequiredMark />
				<Input
					class="mt-1"
					name="login"
					autocomplete="username"
					required
					value={form?.login ?? ''}
				/>
			</Label>
			<Label>
				Пароль<RequiredMark />
				<Input
					class="mt-1"
					name="password"
					type="password"
					autocomplete="current-password"
					required
				/>
			</Label>
			{#if message}
				<p class="text-sm text-red-600 dark:text-red-500" role="alert">{message}</p>
			{/if}
			<Button type="submit" class="w-full">Войти</Button>
		</form>
	</Card>
</div>
