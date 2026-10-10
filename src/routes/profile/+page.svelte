<script lang="ts">
	import { Button, Card, Input, Label } from 'flowbite-svelte';
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

<h1 class="mb-3 text-2xl font-bold">Профиль</h1>

<div class="flex flex-col gap-4">
	<Card class="max-w-none p-4">
		<div class="text-lg font-semibold wrap-anywhere">{data.profile.name}</div>
		<div class="text-sm text-gray-500 dark:text-gray-400">
			Логин: <span class="font-mono break-all">{data.profile.login}</span>
		</div>
	</Card>

	<Card class="max-w-none p-4">
		<h2 class="mb-3 text-lg font-semibold">Смена пароля</h2>
		<form class="flex flex-col gap-4" onsubmit={changePassword}>
			<!-- Lets password managers attach the new password to the right account. -->
			<input type="hidden" name="username" autocomplete="username" value={data.profile.login} />
			<Label>
				Текущий пароль
				<Input
					class="mt-1"
					type="password"
					autocomplete="current-password"
					required
					bind:value={currentPassword}
				/>
			</Label>
			<Label>
				Новый пароль (не короче 8 символов)
				<Input
					class="mt-1"
					type="password"
					autocomplete="new-password"
					required
					minlength={8}
					bind:value={newPassword}
				/>
			</Label>
			<Label>
				Повторите новый пароль
				<Input
					class="mt-1"
					type="password"
					autocomplete="new-password"
					required
					minlength={8}
					bind:value={repeatPassword}
				/>
			</Label>
			{#if message}
				<p
					class="text-sm {message.ok
						? 'text-green-700 dark:text-green-500'
						: 'text-red-600 dark:text-red-500'}"
					role="status"
				>
					{message.text}
				</p>
			{/if}
			<div>
				<Button type="submit" disabled={saving}>Сменить пароль</Button>
			</div>
		</form>
	</Card>

	<form method="POST" action="/logout">
		<Button type="submit" color="red" outline>Выйти</Button>
	</form>
</div>
