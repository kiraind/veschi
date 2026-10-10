<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let repeatPassword = $state('');
	let saving = $state(false);
	let message = $state<{ ok: boolean; text: string } | null>(null);

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		if (newPassword !== repeatPassword) {
			message = { ok: false, text: 'Новый пароль и повтор не совпадают' };
			return;
		}
		saving = true;
		message = null;
		try {
			await api.post('/api/profile/password', { currentPassword, newPassword });
			currentPassword = newPassword = repeatPassword = '';
			message = { ok: true, text: 'Пароль изменён' };
		} catch (e) {
			message = {
				ok: false,
				text: e instanceof ApiError ? e.message : 'Не удалось сменить пароль'
			};
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Профиль — Вещи</title></svelte:head>

<h1>Профиль</h1>

<div class="stack">
	<section class="card">
		<div class="name">{data.profile.name}</div>
		<div class="muted">Логин: <span class="mono">{data.profile.login}</span></div>
	</section>

	<section class="card">
		<h2>Смена пароля</h2>
		<form class="stack" onsubmit={changePassword}>
			<!-- Lets password managers attach the new password to the right account. -->
			<input type="hidden" name="username" autocomplete="username" value={data.profile.login} />
			<label>
				Текущий пароль
				<input
					type="password"
					autocomplete="current-password"
					required
					bind:value={currentPassword}
				/>
			</label>
			<label>
				Новый пароль (не короче 8 символов)
				<input
					type="password"
					autocomplete="new-password"
					required
					minlength="8"
					bind:value={newPassword}
				/>
			</label>
			<label>
				Повторите новый пароль
				<input
					type="password"
					autocomplete="new-password"
					required
					minlength="8"
					bind:value={repeatPassword}
				/>
			</label>
			{#if message}
				<p class:error={!message.ok} class:success={message.ok} role="status">{message.text}</p>
			{/if}
			<button class="primary" type="submit" disabled={saving}>Сменить пароль</button>
		</form>
	</section>

	<form method="POST" action="/logout">
		<button class="danger" type="submit">Выйти</button>
	</form>
</div>

<style>
	.name {
		font-size: 1.2rem;
		font-weight: 600;
	}
	h2 {
		margin-top: 0;
	}
	p {
		margin: 0;
	}
	.success {
		color: var(--success);
	}
</style>
