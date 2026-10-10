<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Card, Input, Label } from 'flowbite-svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Вход — Вещи</title></svelte:head>

<div class="flex min-h-[70vh] items-center justify-center">
	<Card class="w-full max-w-sm p-6">
		<h1 class="mb-4 text-center text-2xl font-bold">Вещи</h1>
		<form method="POST" use:enhance class="flex flex-col gap-4">
			<Label>
				Логин
				<Input
					class="mt-1"
					name="login"
					autocomplete="username"
					required
					value={form?.login ?? ''}
				/>
			</Label>
			<Label>
				Пароль
				<Input
					class="mt-1"
					name="password"
					type="password"
					autocomplete="current-password"
					required
				/>
			</Label>
			{#if form?.message}
				<p class="text-sm text-red-600 dark:text-red-500" role="alert">{form.message}</p>
			{/if}
			<Button type="submit" class="w-full">Войти</Button>
		</form>
	</Card>
</div>
