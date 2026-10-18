import { describe, expect, it } from 'vitest';
import {
	backTarget,
	historyDistance,
	ownerOf,
	resolveTab,
	tabHref,
	visit,
	type StackEntry,
	type TabInput
} from './tabs';

const roots = ['/', '/workbench', '/containers', '/collections', '/types', '/history', '/settings'];

describe('ownerOf', () => {
	it('gives a page to the section it starts with', () => {
		expect(ownerOf('/', roots)).toBe('/');
		expect(ownerOf('/workbench/settings', roots)).toBe('/workbench');
		expect(ownerOf('/types/abc', roots)).toBe('/types');
		expect(ownerOf('/settings/password', roots)).toBe('/settings');
	});

	it('gives the archive to «История»', () => {
		expect(ownerOf('/archive', roots)).toBe('/history');
	});

	it('leaves shared pages without a tab', () => {
		expect(ownerOf('/items/abc', roots)).toBeNull();
		expect(ownerOf('/items/new', roots)).toBeNull();
		expect(ownerOf('/scan', roots)).toBeNull();
		expect(ownerOf('/barcode/4006381333931', roots)).toBeNull();
		expect(ownerOf('/K7M', roots)).toBeNull();
	});
});

describe('resolveTab', () => {
	const base: TabInput = {
		path: '/items/abc',
		kind: 'link',
		saved: undefined,
		tapped: null,
		current: '/',
		roots
	};

	it('keeps a page opened by a link in the current tab', () => {
		expect(resolveTab(base)).toBe('/');
		expect(resolveTab({ ...base, path: '/types/t1', current: '/workbench' })).toBe('/workbench');
		expect(resolveTab({ ...base, kind: 'goto', current: '/containers' })).toBe('/containers');
	});

	it('switches to a section opened at its first page', () => {
		expect(resolveTab({ ...base, path: '/containers' })).toBe('/containers');
	});

	it('uses the tab the user tapped', () => {
		expect(resolveTab({ ...base, tapped: '/containers' })).toBe('/containers');
	});

	it('restores the saved tab on Back and Forward', () => {
		expect(resolveTab({ ...base, kind: 'popstate', saved: '/workbench' })).toBe('/workbench');
		expect(resolveTab({ ...base, kind: 'popstate', saved: null })).toBeNull();
	});

	it('falls back to the address on a direct visit', () => {
		expect(resolveTab({ ...base, kind: 'enter', current: undefined })).toBeNull();
		expect(resolveTab({ ...base, path: '/types/t1', kind: 'enter', current: undefined })).toBe(
			'/types'
		);
		expect(resolveTab({ ...base, kind: 'popstate', saved: undefined })).toBeNull();
	});

	it('stays without a tab when there was none', () => {
		expect(resolveTab({ ...base, current: null })).toBeNull();
		expect(resolveTab({ ...base, path: '/types/t1', current: null })).toBeNull();
	});
});

const page = (path: string, index?: number, href = path): StackEntry => ({
	path,
	href,
	title: path,
	index
});

describe('visit', () => {
	const search = page('/', 1, '/?q=NE555');
	const item = page('/items/a', 2);

	it('puts a new page on top', () => {
		expect(visit([search], { entry: item, tab: '/', replace: false })).toEqual([search, item]);
	});

	it('replaces the top on a replacing navigation', () => {
		const created = page('/items/b', 2);
		expect(
			visit([search, page('/items/new', 2)], { entry: created, tab: '/', replace: true })
		).toEqual([search, created]);
	});

	it('cuts the stack down to a page already in it', () => {
		const container = page('/items/box', 3);
		const again = page('/items/a', 4);
		expect(visit([search, item, container], { entry: again, tab: '/', replace: false })).toEqual([
			search,
			again
		]);
	});

	it('starts over at the root page of the tab', () => {
		const root = page('/', 5);
		expect(visit([search, item], { entry: root, tab: '/', replace: false })).toEqual([root]);
	});

	it('drops pages that failed', () => {
		const gone = { ...page('/items/gone', 3), failed: true };
		const next = page('/types/t', 4);
		expect(visit([search, gone], { entry: next, tab: '/', replace: false })).toEqual([
			search,
			next
		]);
	});
});

describe('backTarget', () => {
	const stack = [page('/', 1), page('/items/a', 5)];

	it('sends Back to the page below when the browser would leave the tab', () => {
		expect(backTarget(stack, '/categories')).toEqual(stack[0]);
	});

	it('lets the browser go back when it goes there anyway', () => {
		expect(backTarget(stack, '/')).toBeNull();
		expect(backTarget([page('/', 1)], '/categories')).toBeNull();
	});
});

describe('historyDistance', () => {
	it('counts history entries when the stack follows the history', () => {
		const stack = [page('/', 1), page('/items/a', 2), page('/items/b', 3)];
		expect(historyDistance(stack, 1)).toBe(1);
		expect(historyDistance(stack, 0)).toBe(2);
	});

	it('gives up when the stack and the history differ', () => {
		expect(historyDistance([page('/', 1), page('/items/a', 5)], 0)).toBeNull();
		expect(historyDistance([page('/types'), page('/types/t', 1)], 0)).toBeNull();
	});
});

describe('tabHref', () => {
	const stacks: Record<string, StackEntry[]> = {
		'/': [page('/', 1, '/?q=NE555'), page('/items/abc', 2)],
		'/workbench': [page('/workbench', 3)]
	};

	it('returns to the top page of another tab', () => {
		expect(tabHref('/', '/workbench', stacks['/'])).toBe('/items/abc');
		expect(tabHref('/containers', '/', undefined)).toBe('/containers');
	});

	it('goes to the first page of the active tab, keeping its query', () => {
		expect(tabHref('/', '/', stacks['/'])).toBe('/?q=NE555');
		expect(tabHref('/workbench', '/workbench', stacks['/workbench'])).toBe('/workbench');
	});

	it('skips a page that failed', () => {
		const stack = [page('/', 1), { ...page('/items/gone', 2), failed: true }];
		expect(tabHref('/', '/workbench', stack)).toBe('/');
	});
});
