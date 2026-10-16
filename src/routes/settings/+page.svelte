<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, ButtonGroup, Card, Listgroup, ListgroupItem } from 'flowbite-svelte';
	import {
		ChevronRightOutline,
		DesktopPcOutline,
		LockOutline,
		MoonOutline,
		SunOutline
	} from 'flowbite-svelte-icons';
	import { api } from '$lib/api';
	import EditButton from '$lib/components/EditButton.svelte';
	import TextEditSheet from '$lib/components/TextEditSheet.svelte';
	import type { Theme } from '$lib/domain/theme';
	import { setTheme } from '$lib/theme';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let renaming = $state(false);
	// svelte-ignore state_referenced_locally
	let theme = $state<Theme>(data.theme);

	const themes = [
		{ value: 'light', label: 'Светлая', icon: SunOutline },
		{ value: 'dark', label: 'Тёмная', icon: MoonOutline },
		{ value: 'system', label: 'Системная', icon: DesktopPcOutline }
	] as const;

	function pick(value: Theme) {
		theme = value;
		setTheme(value);
	}

	async function rename(name: string) {
		await api.patch('/api/profile', { name });
		await invalidateAll();
	}
</script>

<svelte:head><title>Настройки — veschi</title></svelte:head>

<h1 class="mb-3 text-2xl font-bold">Настройки</h1>

<div class="flex flex-col gap-6">
	<Card class="max-w-none p-4">
		<p class="text-sm text-gray-500 dark:text-gray-400">Имя</p>
		<p class="text-lg font-semibold wrap-anywhere">
			{data.profile.name}<EditButton label="Изменить имя" onclick={() => (renaming = true)} />
		</p>
		<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
			Логин: <span class="font-mono break-all">{data.profile.login}</span>
		</p>
	</Card>

	<section>
		<ButtonGroup class="w-full sm:w-auto" role="radiogroup" aria-label="Тема">
			{#each themes as t (t.value)}
				{@const Icon = t.icon}
				{@const selected = theme === t.value}
				<Button
					color={selected ? 'primary' : 'alternative'}
					class="h-11 flex-1 px-3 whitespace-nowrap sm:flex-none"
					role="radio"
					aria-checked={selected}
					onclick={() => pick(t.value)}
				>
					<Icon class="me-1.5 h-5 w-5 flex-none" />{t.label}
				</Button>
			{/each}
		</ButtonGroup>
	</section>

	<Listgroup active class="w-full">
		<ListgroupItem href="/settings/password" class="flex min-h-12 items-center gap-2 text-base">
			<LockOutline class="h-5 w-5 flex-none" />
			<span class="flex-1">Сменить пароль</span>
			<ChevronRightOutline class="h-5 w-5 flex-none text-gray-400" />
		</ListgroupItem>
	</Listgroup>

	<form method="POST" action="/logout">
		<Button type="submit" color="red" outline>Выйти</Button>
	</form>
</div>

<TextEditSheet
	bind:open={renaming}
	title="Имя"
	label="Имя"
	value={data.profile.name}
	required
	helper="Видно в шапке и на рабочем столе («достал(а) …»)."
	onsave={rename}
/>
