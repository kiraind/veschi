import { describe, expect, it } from 'vitest';
import { ownerOf, resolveTab, tabHref, type TabInput } from './tabs';

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
	});
});

describe('tabHref', () => {
	const pages = {
		last: { '/': '/items/abc', '/workbench': '/workbench' },
		top: { '/': '/?q=NE555' }
	};

	it('returns to the last page of another tab', () => {
		expect(tabHref('/', '/workbench', pages)).toBe('/items/abc');
		expect(tabHref('/containers', '/', pages)).toBe('/containers');
	});

	it('goes to the first page of the active tab, keeping its query', () => {
		expect(tabHref('/', '/', pages)).toBe('/?q=NE555');
		expect(tabHref('/workbench', '/workbench', pages)).toBe('/workbench');
	});
});
