<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import type { Component, Snippet } from 'svelte';
	import {
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
		ClockOutline,
		CogOutline,
		AdjustmentsHorizontalOutline,
		DotsHorizontalOutline,
		QrCodeOutline,
		SearchOutline,
		TagOutline,
		ToolsOutline,
		UserCircleOutline,
		SwatchbookOutline
	} from 'flowbite-svelte-icons';
	import ConfirmHost from '$lib/components/ConfirmHost.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	type Link = { href: string; label: string; icon: Component<{ class?: string }> };

	/** On phones the first ones go to the bottom bar, the rest to «Ещё». */
	const primary: Link[] = [
		{ href: '/', label: 'Поиск', icon: SearchOutline },
		{ href: '/scan', label: 'Скан', icon: QrCodeOutline },
		{ href: '/workbench', label: 'Стол', icon: ToolsOutline },
		{ href: '/containers', label: 'Контейнеры', icon: ArchiveOutline }
	];
	const secondary: Link[] = [
		{ href: '/stickers', label: 'Наклейки', icon: TagOutline },
		{ href: '/types', label: 'Типы вещей', icon: SwatchbookOutline },
		{ href: '/params', label: 'Параметры', icon: AdjustmentsHorizontalOutline },
		{ href: '/history', label: 'История', icon: ClockOutline }
	];

	let moreOpen = $state(false);

	/**
	 * Tab bar colors. Inactive: gray, hover darkens the text and shows a gray pill
	 * behind the icon. Active: primary text on a light primary pill, hover deepens both.
	 * (`hover:` only applies on devices with a pointer, so taps don't leave it stuck.)
	 */
	const tabClass = (active: boolean) =>
		`flex flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-none ${
			active
				? 'text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200'
				: 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
		}`;
	const pillClass = (active: boolean) =>
		`flex h-8 w-14 items-center justify-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-primary-400 ${
			active
				? 'bg-primary-100 group-hover:bg-primary-200 dark:bg-primary-900/60 dark:group-hover:bg-primary-800/70'
				: 'group-hover:bg-gray-100 dark:group-hover:bg-gray-700'
		}`;

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') return path === '/';
		// Item cards belong to «Контейнеры».
		if (href === '/containers' && path.startsWith('/items')) return true;
		// The archive opens from «История».
		if (href === '/history' && path.startsWith('/archive')) return true;
		return path === href || path.startsWith(`${href}/`);
	}

	const moreActive = $derived(
		[...secondary.map((l) => l.href), '/settings'].some((href) => isActive(href))
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
				href="/settings"
				title="Настройки"
				class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
				aria-current={isActive('/settings') ? 'page' : undefined}
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
	<!-- Own tab bar (not Flowbite's BottomNav): its dark-theme colors (white icons, gray
	     labels, dark blue active tab) could not be fixed by overrides alone. -->
	<nav
		class="fixed start-0 bottom-0 z-30 w-full border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-gray-700 dark:bg-gray-800"
		aria-label="Основные разделы"
	>
		<div class="mx-auto grid h-16 max-w-lg grid-cols-5">
			{#each primary as link (link.href)}
				{@const Icon = link.icon}
				{@const active = isActive(link.href)}
				<a
					href={link.href}
					class="group {tabClass(active)}"
					aria-current={active ? 'page' : undefined}
				>
					<span class={pillClass(active)}><Icon class="h-6 w-6" /></span>
					<span class="text-xs">{link.label}</span>
				</a>
			{/each}
			<button type="button" class="group {tabClass(moreActive)}" onclick={() => (moreOpen = true)}>
				<span class={pillClass(moreActive)}><DotsHorizontalOutline class="h-6 w-6" /></span>
				<span class="text-xs">Ещё</span>
			</button>
		</div>
	</nav>

	<!-- Our sheet with its own close button: the Drawer's built-in one sat under the menu. -->
	<Sheet bind:open={moreOpen} title="Ещё">
		<Sidebar
			alwaysOpen
			activeUrl={page.url.pathname}
			position="static"
			class="w-full bg-transparent dark:bg-transparent"
			classes={{ div: 'bg-transparent px-0 py-0 dark:bg-transparent' }}
		>
			<SidebarGroup>
				{#each secondary as link (link.href)}
					{@const Icon = link.icon}
					<SidebarItem href={link.href} label={link.label}>
						{#snippet icon()}<Icon class="h-5 w-5" />{/snippet}
					</SidebarItem>
				{/each}
				<SidebarItem href="/settings" label="Настройки">
					{#snippet icon()}<CogOutline class="h-5 w-5" />{/snippet}
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
	</Sheet>
{/if}

<ConfirmHost />
