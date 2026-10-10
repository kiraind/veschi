<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const links = [
		{ href: '/', label: 'Поиск' },
		{ href: '/scan', label: 'Скан' },
		{ href: '/workbench', label: 'Стол' },
		{ href: '/items', label: 'Вещи' },
		{ href: '/stickers', label: 'Наклейки' },
		{ href: '/types', label: 'Типы' },
		{ href: '/dictionaries', label: 'Справочники' },
		{ href: '/archive', label: 'Архив' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
	}
</script>

{#if data.user}
	<header class="topbar">
		<nav>
			{#each links as link (link.href)}
				<a href={link.href} aria-current={isActive(link.href) ? 'page' : undefined}>{link.label}</a>
			{/each}
		</nav>
		<a class="profile" href="/profile" title="Профиль">{data.user.name}</a>
	</header>
{/if}

<main class="content">
	{@render children()}
</main>

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		padding-top: max(0.4rem, env(safe-area-inset-top));
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	nav {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		flex: 1;
		scrollbar-width: none;
	}
	nav a,
	.profile {
		padding: 0.4rem 0.6rem;
		border-radius: 8px;
		text-decoration: none;
		color: var(--text);
		white-space: nowrap;
	}
	nav a[aria-current='page'] {
		background: var(--accent);
		color: var(--accent-text);
	}
	.profile {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.content {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0.75rem 1rem 4rem;
	}
</style>
