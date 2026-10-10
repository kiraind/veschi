import { describe, expect, it } from 'vitest';
import {
	DEFAULT_WORKBENCH_ICON,
	WORKBENCH_ICON_KEYS,
	isWorkbenchIconKey,
	workbenchIconKey,
	workbenchIconLabel
} from './workbench-icons';

describe('workbench icons', () => {
	it('has unique keys including the default', () => {
		expect(new Set(WORKBENCH_ICON_KEYS).size).toBe(WORKBENCH_ICON_KEYS.length);
		expect(WORKBENCH_ICON_KEYS).toContain(DEFAULT_WORKBENCH_ICON);
	});

	it('validates keys', () => {
		expect(isWorkbenchIconKey('garage')).toBe(true);
		expect(isWorkbenchIconKey('nope')).toBe(false);
		expect(isWorkbenchIconKey(null)).toBe(false);
	});

	it('falls back to the default for null and unknown keys', () => {
		expect(workbenchIconKey(null)).toBe(DEFAULT_WORKBENCH_ICON);
		expect(workbenchIconKey('removed-icon')).toBe(DEFAULT_WORKBENCH_ICON);
		expect(workbenchIconKey('garage')).toBe('garage');
		expect(workbenchIconLabel('garage')).toBe('Гараж');
	});
});
