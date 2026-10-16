<script lang="ts">
	import { page } from '$app/state';
	import { Button } from 'flowbite-svelte';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Не найдено' : 'Ошибка'} — veschi</title></svelte:head>

<h1 class="mb-2 text-2xl font-bold">{notFound ? 'Не найдено' : 'Что-то пошло не так'}</h1>
<p class="mb-4 text-gray-500 dark:text-gray-400">
	{#if notFound}
		Такой страницы нет: возможно, вещь или запись удалили навсегда.
	{:else if page.status >= 500}
		Ошибка на сервере ({page.status}). Попробуйте обновить страницу.
	{:else}
		{page.error?.message}
	{/if}
</p>
<Button href="/">На главную</Button>
