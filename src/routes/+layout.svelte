<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import type { Component, Snippet } from 'svelte';
	import {
		BottomNav,
		BottomNavItem,
		Drawer,
		Navbar,
		NavBrand,
		NavLi,
		NavUl,
		Sidebar,
		SidebarGroup,
		SidebarItem
	} from 'flowbite-svelte';
	import {
		ArchiveOutline,
		ArrowRightToBracketOutline,
		BookOpenOutline,
		DesktopPcOutline,
		DotsHorizontalOutline,
		FolderOpenOutline,
		QrCodeOutline,
		SearchOutline,
		TagOutline,
		UserCircleOutline,
		SwatchbookOutline
	} from 'flowbite-svelte-icons';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	type Link = { href: string; label: string; icon: Component<{ class?: string }> };

	/** On phones the first ones go to the bottom bar, the rest to «Ещё». */
	const primary: Link[] = [
		{ href: '/', label: 'Поиск', icon: SearchOutline },
		{ href: '/scan', label: 'Скан', icon: QrCodeOutline },
		{ href: '/workbench', label: 'Стол', icon: DesktopPcOutline },
		{ href: '/containers', label: 'Контейнеры', icon: FolderOpenOutline }
	];
	const secondary: Link[] = [
		{ href: '/stickers', label: 'Наклейки', icon: TagOutline },
		{ href: '/types', label: 'Типы', icon: SwatchbookOutline },
		{ href: '/dictionaries', label: 'Справочники', icon: BookOpenOutline },
		{ href: '/archive', label: 'Архив', icon: ArchiveOutline }
	];

	let moreOpen = $state(false);

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') return path === '/';
		// Item cards belong to «Контейнеры».
		if (href === '/containers' && path.startsWith('/items')) return true;
		return path === href || path.startsWith(`${href}/`);
	}

	const moreActive = $derived(
		[...secondary.map((l) => l.href), '/profile'].some((href) => isActive(href))
	);

	// Close «Ещё» after navigating.
	$effect(() => {
		void page.url.pathname;
		moreOpen = false;
	});
</script>

{#if data.user}
	<Navbar
		class="sticky top-0 z-30 border-b border-gray-200 pt-[env(safe-area-inset-top)] dark:border-gray-700"
		fluid
	>
		<NavBrand href="/">
			<span class="text-lg font-semibold whitespace-nowrap dark:text-white">Veschi</span>
		</NavBrand>
		<div class="flex items-center md:order-2">
			<a
				href="/profile"
				class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
				aria-current={isActive('/profile') ? 'page' : undefined}
			>
				<UserCircleOutline class="h-5 w-5" />
				<span class="max-w-32 truncate">{data.user.name}</span>
			</a>
		</div>
		<NavUl class="order-1 hidden md:block" activeUrl={page.url.pathname}>
			{#each [...primary, ...secondary] as link (link.href)}
				<NavLi
					href={link.href}
					class={isActive(link.href) ? 'md:text-primary-700 dark:md:text-primary-400' : ''}
				>
					{link.label}
				</NavLi>
			{/each}
		</NavUl>
	</Navbar>
{/if}

<main
	class="mx-auto max-w-3xl px-4 pt-3 {data.user
		? 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-16'
		: 'pb-16'}"
>
	{@render children()}
</main>

{#if data.user}
	<BottomNav
		position="fixed"
		class="pb-[env(safe-area-inset-bottom)] md:hidden"
		classes={{ inner: 'grid-cols-5' }}
	>
		{#each primary as link (link.href)}
			{@const Icon = link.icon}
			<BottomNavItem
				href={link.href}
				btnName={link.label}
				classes={{ span: 'text-xs' }}
				active={isActive(link.href)}
				aria-current={isActive(link.href) ? 'page' : undefined}
			>
				<Icon class="mb-1 h-6 w-6" />
			</BottomNavItem>
		{/each}
		<BottomNavItem
			btnName="Ещё"
			classes={{ span: 'text-xs' }}
			active={moreActive}
			onclick={() => (moreOpen = true)}
		>
			<DotsHorizontalOutline class="mb-1 h-6 w-6" />
		</BottomNavItem>
	</BottomNav>

	<Drawer
		bind:open={moreOpen}
		placement="bottom"
		class="rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
	>
		<Sidebar
			alwaysOpen
			activeUrl={page.url.pathname}
			position="static"
			class="w-full bg-transparent dark:bg-transparent"
			classes={{ div: 'bg-transparent px-0 dark:bg-transparent' }}
		>
			<SidebarGroup>
				{#each secondary as link (link.href)}
					{@const Icon = link.icon}
					<SidebarItem href={link.href} label={link.label}>
						{#snippet icon()}<Icon class="h-5 w-5" />{/snippet}
					</SidebarItem>
				{/each}
				<SidebarItem href="/profile" label="Профиль — {data.user.name}">
					{#snippet icon()}<UserCircleOutline class="h-5 w-5" />{/snippet}
				</SidebarItem>
			</SidebarGroup>
			<SidebarGroup border>
				<form method="POST" action="/logout">
					<button
						type="submit"
						class="flex w-full items-center gap-3 rounded-lg p-2 text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
					>
						<ArrowRightToBracketOutline class="h-5 w-5" />
						Выйти
					</button>
				</form>
			</SidebarGroup>
		</Sidebar>
	</Drawer>
{/if}
