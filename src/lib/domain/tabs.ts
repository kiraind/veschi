/**
 * Which section (tab) a page belongs to, and each tab's own stack of pages. A page opened
 * from a tab stays in that tab, whatever its address; switching back to the tab opens the
 * page on top of its stack, and Back (the system one or the breadcrumbs) goes down that
 * stack, not to the tab used before. A tab is named by its root address ('/', '/workbench');
 * pages opened outside any tab (a QR link) have a stack of their own, under `null`.
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
	/** The tab before this navigation (undefined before the first one; null: no tab). */
	current: string | null | undefined;
	roots: readonly string[];
}

/** The tab of the page just navigated to. */
export function resolveTab({ path, kind, saved, tapped, current, roots }: TabInput): string | null {
	if (tapped !== null) return tapped;
	// A section's own first page is always that section, however it was reached.
	if (roots.includes(path)) return path;
	if (saved !== undefined && (kind === 'popstate' || kind === 'enter')) return saved;
	if (current !== undefined && kind !== 'enter' && kind !== 'popstate') return current;
	return ownerOf(path, roots);
}

/** A page in a tab's stack. */
export interface StackEntry {
	path: string;
	/** Path and query (search text, filters). */
	href: string;
	/** Shown in the breadcrumbs. */
	title: string;
	/** SvelteKit's index of the browser history entry; none for a page not in the history. */
	index?: number;
	/** The page failed (deleted item, 404): not worth coming back to. */
	failed?: boolean;
}

export interface Visit {
	entry: StackEntry;
	/** The tab's root address (null: pages outside any tab). */
	tab: string | null;
	/** The page replaced the previous one (`goto(..., { replaceState: true })`). */
	replace: boolean;
}

/**
 * The tab's stack after opening a page. A page already in the stack (Back, a breadcrumb,
 * a link to where the user came from) cuts the stack down to it, so it never loops; the
 * tab's root page starts the stack over.
 */
export function visit(stack: readonly StackEntry[], { entry, tab, replace }: Visit): StackEntry[] {
	if (entry.path === tab) return [entry];
	const kept = (replace ? stack.slice(0, -1) : stack).filter((e) => !e.failed);
	const at = kept.findIndex((e) => e.path === entry.path);
	return [...(at === -1 ? kept : kept.slice(0, at)), entry];
}

/**
 * Where Back from the top of the stack must lead when the browser goes to `to` instead:
 * the page under the top. Null when the browser is right, or the tab has nothing below
 * (then Back leaves the tab as usual).
 */
export function backTarget(stack: readonly StackEntry[], to: string): StackEntry | null {
	const below = stack.at(-2);
	return below && below.path !== to ? below : null;
}

/**
 * How far back in the browser history a page of the stack is, if the pages above it are
 * exactly the last history entries (then the browser can go there itself, with its scroll).
 */
export function historyDistance(stack: readonly StackEntry[], at: number): number | null {
	for (let i = at; i < stack.length - 1; i++) {
		const here = stack[i]?.index;
		if (here === undefined || stack[i + 1]?.index !== here + 1) return null;
	}
	return stack.length - 1 - at;
}

/**
 * Where a tab leads: from another tab, back to the page on top of its stack; on the tab
 * itself, to its first page (like tapping an active tab in a phone app), keeping its query.
 */
export function tabHref(
	root: string,
	current: string | null | undefined,
	stack: readonly StackEntry[] | undefined
): string {
	const pages = (stack ?? []).filter((e) => !e.failed);
	const first = pages[0];
	if (current === root) return first?.path === root ? first.href : root;
	return pages.at(-1)?.href ?? root;
}
