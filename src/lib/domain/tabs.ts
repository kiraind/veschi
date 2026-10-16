/**
 * Which section (tab) a page belongs to. Every section keeps its own stack: a page opened
 * from a tab stays in that tab, whatever its address, and switching back to the tab opens
 * the page that was last open there. A tab is named by its root address ('/', '/workbench').
 */

/** How the page was reached, as SvelteKit's `afterNavigate` reports it. */
export type NavigationKind = 'enter' | 'form' | 'leave' | 'link' | 'goto' | 'popstate';

/** Pages that are not part of any section of their own: they belong to the tab they were opened from. */
const SHARED = ['/items', '/scan', '/barcode'];

/** Sections that open from another one: the archive from «История». */
const ALIASES: Record<string, string> = { '/archive': '/history' };

function under(path: string, root: string): boolean {
	return root === '/' ? path === '/' : path === root || path.startsWith(`${root}/`);
}

/**
 * The tab of a page opened directly (a typed address, a QR link, a reload): the section whose
 * address it starts with. Item cards, the scanner and sticker pages belong to none.
 */
export function ownerOf(path: string, roots: readonly string[]): string | null {
	for (const [alias, root] of Object.entries(ALIASES)) {
		if (under(path, alias)) path = root;
	}
	if (SHARED.some((shared) => under(path, shared))) return null;
	let best: string | null = null;
	for (const root of roots) {
		if (under(path, root) && (best === null || root.length > best.length)) best = root;
	}
	return best;
}

export interface TabInput {
	path: string;
	kind: NavigationKind;
	/** The tab saved with this history entry, if any (restored by Back / Forward). */
	saved: string | null | undefined;
	/** The tab the user tapped to get here. */
	tapped: string | null;
	/** The tab before this navigation (undefined before the first one). */
	current: string | null | undefined;
	roots: readonly string[];
}

/** The tab of the page just navigated to. */
export function resolveTab({ path, kind, saved, tapped, current, roots }: TabInput): string | null {
	if (tapped !== null) return tapped;
	// A section's own first page is always that section, however it was reached.
	if (roots.includes(path)) return path;
	if (saved !== undefined && (kind === 'popstate' || kind === 'enter')) return saved;
	if (current !== undefined && current !== null && kind !== 'enter' && kind !== 'popstate') {
		return current;
	}
	return ownerOf(path, roots);
}

/** Address (path and query) of the pages last open in each tab. */
export interface TabPages {
	/** Any page of the tab. */
	last: Record<string, string>;
	/** The tab's own first page, with its query (search text, filters). */
	top: Record<string, string>;
}

/**
 * Where a tab leads: from another tab, back to the page last open in it; on the tab itself,
 * to its first page (like tapping an active tab in a phone app), keeping its query.
 */
export function tabHref(root: string, current: string | null | undefined, pages: TabPages): string {
	return (current === root ? pages.top[root] : pages.last[root]) ?? root;
}
