/**
 * Tab stacks (see `$lib/domain/tabs`): which tab is active and the page last open in each.
 * The active tab is saved with every history entry (`page.state.tab`), so Back and Forward
 * light up the tab the page was opened in. The last pages survive a reload (sessionStorage).
 * Only the browser changes this state: on the server it stays empty for every request.
 */
import { afterNavigate, replaceState } from '$app/navigation';
import { page } from '$app/state';
import { ownerOf, resolveTab, tabHref, type TabPages } from '$lib/domain/tabs';

const STORAGE_KEY = 'veschi:tabs';

function loadPages(): TabPages {
	try {
		const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
		return { last: { ...saved?.last }, top: { ...saved?.top } };
	} catch {
		return { last: {}, top: {} };
	}
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

class Tabs {
	/** The active tab; undefined until the first navigation in the browser. */
	current = $state<string | null | undefined>(undefined);
	/** Pages last open in each tab. */
	pages = $state<TabPages>({ last: {}, top: {} });

	#roots: readonly string[] = [];
	#tapped: string | null = null;
	#restored = false;

	/** The active tab, also during server rendering and before the first navigation. */
	active(): string | null {
		return this.current === undefined ? ownerOf(page.url.pathname, this.#roots) : this.current;
	}

	href(root: string): string {
		return tabHref(root, this.active(), this.pages);
	}

	/** Click handler of a tab link: the page it opens belongs to that tab. */
	tap(root: string, event: MouseEvent) {
		const plain =
			event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
		if (plain) this.#tapped = root;
	}

	/** Call once from the root layout with the addresses of all tabs. */
	track(roots: readonly string[]) {
		this.#roots = roots;
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
				this.pages = loadPages();
			}
			if (page.state.tab !== tab) saveTab(tab, page.url.href);
			if (tab === null) return;
			// A page that failed (deleted item, 404) is not worth coming back to.
			const address = path + navigation.to.url.search;
			if (page.status >= 400) delete this.pages.last[tab];
			else this.pages.last[tab] = address;
			if (path === tab) this.pages.top[tab] = address;
			try {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.pages));
			} catch {
				// Private mode or storage full: the stacks just don't survive a reload.
			}
		});
	}
}

export const tabs = new Tabs();
