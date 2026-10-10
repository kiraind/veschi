<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Вход — Вещи</title></svelte:head>

<main class="login">
	<h1>Вещи</h1>
	<form method="POST" use:enhance class="stack">
		<label>
			Логин
			<input name="login" autocomplete="username" required value={form?.login ?? ''} />
		</label>
		<label>
			Пароль
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}
		<button class="primary" type="submit">Войти</button>
	</form>
</main>

<style>
	.login {
		max-width: 22rem;
		margin: 15vh auto 0;
		padding: 0 1rem;
	}
	h1 {
		text-align: center;
	}
</style>
