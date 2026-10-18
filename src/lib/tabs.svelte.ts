/**
 * Tab stacks (see `$lib/domain/tabs`): which tab is active and the pages opened in each.
 * The active tab is saved with every history entry (`page.state.tab`), so Back and Forward
 * light up the tab the page was opened in. When the browser's Back would leave the tab while
 * the tab still has a page below, it is sent to that page instead. The stacks survive a
 * reload (sessionStorage). Only the browser changes this state: on the server it stays empty.
 */
import { tick } from 'svelte';
import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation';
import { page } from '$app/state';
import {
	backTarget,
	historyDistance,
	ownerOf,
	resolveTab,
	tabHref,
	visit,
	type StackEntry
} from '$lib/domain/tabs';

const STORAGE_KEY = 'veschi:stacks';
/** Pages outside any tab keep their stack under this key. */
const NO_TAB = '';
const TITLE_SUFFIX = ' — veschi';

type Stacks = Record<string, StackEntry[]>;

function loadStacks(): Stacks {
	try {
		const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
		return saved && typeof saved === 'object' ? saved : {};
	} catch {
		return {};
	}
}

/**
 * SvelteKit's number of the current browser history entry: the same after a navigation
 * with `replaceState`, one more after a new entry. (Not public API, hence optional.)
 */
function historyIndex(): number | undefined {
	const index = history.state?.['sveltekit:history'];
	return typeof index === 'number' ? index : undefined;
}

/** Saves the tab with the current history entry (on the first page, once the router is up). */
function saveTab(tab: string | null, href: string) {
	if (location.href !== href) return;
	try {
		replaceState('', { ...page.state, tab });
	} catch {
		// The first page: SvelteKit's router starts right after `afterNavigate`.
		setTimeout(() => saveTab(tab, href));
	}
}

export interface TabLink {
	href: string;
	label: string;
}

class Tabs {
	/** The active tab; undefined until the first navigation in the browser. */
	current = $state<string | null | undefined>(undefined);
	/** Pages opened in each tab, the current one on top. */
	stacks = $state<Stacks>({});

	#links: readonly TabLink[] = [];
	#tapped: string | null = null;
	#restored = false;
	#index: number | undefined;

	/** The active tab, also during server rendering and before the first navigation. */
	active(): string | null {
		return this.current === undefined ? ownerOf(page.url.pathname, this.#roots()) : this.current;
	}

	href(root: string): string {
		return tabHref(root, this.active(), this.stacks[root]);
	}

	/** Pages the user came through in this tab to the current one (empty before hydration). */
	trail(): StackEntry[] {
		const stack = this.#stack();
		return stack.at(-1)?.path === page.url.pathname ? stack.slice(0, -1) : [];
	}

	/** Goes back to a page of the trail: through the browser history when it is right there. */
	back(entry: StackEntry) {
		const stack = this.#stack();
		const at = stack.indexOf(entry);
		const distance = at === -1 ? null : historyDistance(stack, at);
		if (distance) history.go(-distance);
		else goto(entry.href, { replaceState: true });
	}

	/** Click handler of a tab link: the page it opens belongs to that tab. */
	tap(root: string, event: MouseEvent) {
		const plain =
			event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
		if (plain) this.#tapped = root;
	}

	#roots() {
		return this.#links.map((l) => l.href);
	}

	#stack(): StackEntry[] {
		return (this.current === undefined ? undefined : this.stacks[this.current ?? NO_TAB]) ?? [];
	}

	#save() {
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.stacks));
		} catch {
			// Private mode or storage full: the stacks just don't survive a reload.
		}
	}

	/** Call once from the root layout with all tabs. */
	track(links: readonly TabLink[]) {
		this.#links = links;
		const roots = this.#roots();

		// The browser's Back goes to the page before in its own history, which may be another
		// tab: the tab's previous page is opened instead, in place of the current one.
		beforeNavigate((navigation) => {
			if (navigation.type !== 'popstate' || navigation.delta !== -1 || !navigation.to) return;
			const target = backTarget(this.#stack(), navigation.to.url.pathname);
			if (!target) return;
			navigation.cancel();
			// Cancelling sends the browser forward again; replace the page once it is back.
			addEventListener('popstate', () => goto(target.href, { replaceState: true }), {
				once: true
			});
		});

		afterNavigate((navigation) => {
			const tapped = this.#tapped;
			this.#tapped = null;
			if (!navigation.to) return;
			const path = navigation.to.url.pathname;
			const tab = resolveTab({
				path,
				kind: navigation.type,
				saved: page.state.tab,
				tapped,
				current: this.current,
				roots
			});
			this.current = tab;
			// Read after hydration: links rendered on the server must not change while hydrating.
			if (!this.#restored) {
				this.#restored = true;
				this.stacks = loadStacks();
			}
			if (page.state.tab !== tab) saveTab(tab, page.url.href);

			const index = historyIndex();
			const replace =
				navigation.type !== 'popstate' &&
				navigation.type !== 'enter' &&
				index !== undefined &&
				index === this.#index;
			this.#index = index;
			const key = tab ?? NO_TAB;
			let stack = this.stacks[key] ?? [];
			// Opened directly inside a section: the breadcrumbs lead to the section's first page.
			const link = this.#links.find((l) => l.href === tab);
			if (stack.length === 0 && link && path !== link.href) {
				stack = [{ path: link.href, href: link.href, title: link.label }];
			}
			const entry: StackEntry = {
				path,
				href: path + navigation.to.url.search,
				title: '',
				index,
				failed: page.status >= 400 || undefined
			};
			this.stacks[key] = visit(stack, { entry, tab, replace });
			this.#save();

			// The page sets its <title> as it renders.
			tick().then(() => {
				const top = this.stacks[key]?.at(-1);
				if (top?.path !== path) return;
				const title = document.title;
				top.title = title.endsWith(TITLE_SUFFIX) ? title.slice(0, -TITLE_SUFFIX.length) : title;
				this.#save();
			});
		});
	}
}

export const tabs = new Tabs();
