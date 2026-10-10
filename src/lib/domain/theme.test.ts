import { describe, expect, it } from 'vitest';
import { isDarkTheme, parseTheme } from './theme';

describe('parseTheme', () => {
	it('accepts the known themes', () => {
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('dark')).toBe('dark');
		expect(parseTheme('system')).toBe('system');
	});

	it('falls back to system', () => {
		expect(parseTheme(undefined)).toBe('system');
		expect(parseTheme(null)).toBe('system');
		expect(parseTheme('')).toBe('system');
		expect(parseTheme('DARK')).toBe('system');
		expect(parseTheme('<script>')).toBe('system');
	});
});

describe('isDarkTheme', () => {
	it('follows the choice, or the device for system', () => {
		expect(isDarkTheme('dark', false)).toBe(true);
		expect(isDarkTheme('light', true)).toBe(false);
		expect(isDarkTheme('system', true)).toBe(true);
		expect(isDarkTheme('system', false)).toBe(false);
	});
});
