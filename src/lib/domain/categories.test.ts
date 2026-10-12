import { describe, expect, it } from 'vitest';
import {
	categoryNames,
	categoryParamsSchema,
	inCategories,
	incompleteOwners,
	missingParams,
	requiredAt,
	type CategoryRequirement
} from './categories';
import type { ParamDefView } from './params';

function def(id: string, name: string): ParamDefView {
	return {
		id,
		name,
		valueType: 'NUMBER',
		unit: null,
		multiple: false,
		options: [],
		typeCount: 0,
		itemCount: 0,
		holder: null,
		inverse: null
	};
}

const kcal = def('kcal', 'Калорийность');
const expiry = def('expiry', 'Срок годности');
const material = def('material', 'Материал');

function req(categoryId: string, d: ParamDefView, level: 'TYPE' | 'ITEM'): CategoryRequirement {
	return { categoryId, categoryName: categoryId, def: d, level };
}

describe('requiredAt', () => {
	const requirements = [
		req('Еда', kcal, 'TYPE'),
		req('Еда', expiry, 'ITEM'),
		req('Хрупкое', material, 'TYPE'),
		req('Хрупкое', kcal, 'TYPE'),
		req('Хрупкое', expiry, 'TYPE')
	];

	it('merges categories by parameter, first occurrence first', () => {
		expect(
			requiredAt(requirements, 'TYPE').map((r) => [r.def.name, r.categories.map((c) => c.id)])
		).toEqual([
			['Калорийность', ['Еда', 'Хрупкое']],
			['Материал', ['Хрупкое']],
			['Срок годности', ['Хрупкое']]
		]);
	});

	it('keeps levels apart: the same parameter may be required at both', () => {
		expect(requiredAt(requirements, 'ITEM').map((r) => r.def.name)).toEqual(['Срок годности']);
	});

	it('lists required parameters without a value', () => {
		const required = requiredAt(requirements, 'TYPE');
		expect(missingParams(required, [{ defId: 'kcal' }]).map((r) => r.def.id)).toEqual([
			'material',
			'expiry'
		]);
		expect(
			missingParams(
				required,
				required.map((r) => ({ defId: r.def.id }))
			)
		).toEqual([]);
	});
});

describe('category names', () => {
	it('reads as a list', () => {
		const c = (name: string) => ({ id: name, name });
		expect(categoryNames([c('Еда')])).toBe('«Еда»');
		expect(inCategories([c('Еда')])).toBe('в категории «Еда»');
		expect(inCategories([c('Еда'), c('Хрупкое'), c('Химия')])).toBe(
			'в категориях «Еда», «Хрупкое» и «Химия»'
		);
	});
});

describe('categoryParamsSchema', () => {
	it('rejects a parameter twice and unknown levels', () => {
		const id = 'ckq8z1x0f0000qz3j6h1x2y3z';
		expect(
			categoryParamsSchema.safeParse([
				{ defId: id, level: 'TYPE' },
				{ defId: id, level: 'ITEM' }
			]).success
		).toBe(false);
		expect(categoryParamsSchema.safeParse([{ defId: id, level: 'BOX' }]).success).toBe(false);
		expect(categoryParamsSchema.safeParse([{ defId: id, level: 'ITEM' }]).success).toBe(true);
	});
});

describe('incompleteOwners', () => {
	it('names items and types in the genitive', () => {
		expect(incompleteOwners(1, 0)).toBe('у 1 вещи');
		expect(incompleteOwners(3, 0)).toBe('у 3 вещей');
		expect(incompleteOwners(21, 1)).toBe('у 21 вещи и 1 типа');
		expect(incompleteOwners(0, 5)).toBe('у 5 типов');
		expect(incompleteOwners(0, 0)).toBe('');
	});
});
