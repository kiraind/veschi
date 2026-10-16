import { describe, expect, it } from 'vitest';
import {
	entryCountText,
	entryInputSchema,
	entryUpdateSchema,
	missingText,
	totalShortage,
	shortage,
	stockText,
	type EntryStock
} from './collections';

const typeLine = (quantity: number, have: number) => ({
	quantity,
	stock: { kind: 'type', have } as EntryStock
});
const itemLine = (quantity: number, have: number, archived = false) => ({
	quantity,
	stock: { kind: 'item', have, archived, path: [] } as EntryStock
});

describe('entryInputSchema', () => {
	it('takes exactly one of a type, a type name or an item', () => {
		expect(entryInputSchema.parse({ typeId: 'ctype001' })).toEqual({
			typeId: 'ctype001',
			quantity: 1
		});
		expect(entryInputSchema.parse({ typeName: ' Плата ', quantity: 2 })).toEqual({
			typeName: 'Плата',
			quantity: 2
		});
		expect(entryInputSchema.safeParse({}).success).toBe(false);
		expect(entryInputSchema.safeParse({ typeId: 'ctype001', itemId: 'citem001' }).success).toBe(
			false
		);
		expect(entryInputSchema.safeParse({ typeName: '   ' }).success).toBe(false);
	});

	it('wants a whole quantity from 1', () => {
		expect(entryUpdateSchema.safeParse({ quantity: 0 }).success).toBe(false);
		expect(entryUpdateSchema.safeParse({ quantity: 1.5 }).success).toBe(false);
		expect(entryUpdateSchema.safeParse({ quantity: 2_000_000 }).success).toBe(false);
		expect(entryUpdateSchema.parse({ quantity: 3 })).toEqual({ quantity: 3 });
	});
});

describe('stock of a line', () => {
	it('counts what is short', () => {
		expect(shortage(typeLine(3, 5))).toBe(0);
		expect(shortage(typeLine(3, 1))).toBe(2);
		expect(shortage(itemLine(1, 1))).toBe(0);
		expect(shortage(itemLine(1, 1, true))).toBe(1);
	});

	it('says what there is in words', () => {
		expect(stockText(typeLine(3, 5))).toEqual({ text: 'есть 5 штук', ok: true });
		expect(stockText(typeLine(3, 1))).toEqual({ text: 'есть 1, не хватает 2', ok: false });
		expect(stockText(typeLine(2, 0))).toEqual({ text: 'нет ни одной', ok: false });
		expect(stockText(itemLine(1, 1))).toEqual({ text: '', ok: true });
		expect(stockText(itemLine(4, 3))).toEqual({ text: 'есть 3, не хватает 1', ok: false });
		expect(stockText(itemLine(1, 1, true))).toEqual({ text: 'в архиве', ok: false });
	});

	it('counts lines in words', () => {
		expect(entryCountText(0)).toBe('пусто');
		expect(entryCountText(1)).toBe('1 позиция');
		expect(entryCountText(3)).toBe('3 позиции');
		expect(entryCountText(5)).toBe('5 позиций');
	});

	it('counts what is short in pieces', () => {
		expect(totalShortage([typeLine(3, 1), itemLine(1, 1, true), typeLine(2, 5)])).toBe(3);
		expect(missingText(1)).toBe('не хватает 1 штуки');
		expect(missingText(2)).toBe('не хватает 2 штук');
		expect(missingText(21)).toBe('не хватает 21 штуки');
	});
});
