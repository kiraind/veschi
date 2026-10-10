/**
 * Icons a workbench can have. Only the key is stored (`Item.icon`); the key →
 * component mapping lives in `WorkbenchIcon.svelte`. null = DEFAULT_WORKBENCH_ICON.
 */
export const WORKBENCH_ICONS = [
	{ key: 'desktop', label: 'Компьютерный стол' },
	{ key: 'home', label: 'Дом' },
	{ key: 'garage', label: 'Гараж' },
	{ key: 'tools', label: 'Инструменты' },
	{ key: 'hammer', label: 'Мастерская' },
	{ key: 'briefcase', label: 'Работа' },
	{ key: 'building', label: 'Офис' },
	{ key: 'kitchen', label: 'Кухня, огород' },
	{ key: 'garden', label: 'Дача, улица' },
	{ key: 'bed', label: 'Спальня' },
	{ key: 'book', label: 'Учёба, книги' },
	{ key: 'palette', label: 'Творчество' },
	{ key: 'music', label: 'Музыка' },
	{ key: 'camera', label: 'Фото' },
	{ key: 'lab', label: 'Лаборатория' },
	{ key: 'storage', label: 'Кладовка' }
] as const;

export type WorkbenchIconKey = (typeof WORKBENCH_ICONS)[number]['key'];

export const WORKBENCH_ICON_KEYS = WORKBENCH_ICONS.map((i) => i.key) as [
	WorkbenchIconKey,
	...WorkbenchIconKey[]
];

export const DEFAULT_WORKBENCH_ICON: WorkbenchIconKey = 'desktop';

export function isWorkbenchIconKey(key: unknown): key is WorkbenchIconKey {
	return typeof key === 'string' && (WORKBENCH_ICON_KEYS as string[]).includes(key);
}

/** The stored key, or the default for null / a key no longer in the list. */
export function workbenchIconKey(stored: string | null | undefined): WorkbenchIconKey {
	return isWorkbenchIconKey(stored) ? stored : DEFAULT_WORKBENCH_ICON;
}

export function workbenchIconLabel(stored: string | null | undefined): string {
	const key = workbenchIconKey(stored);
	return WORKBENCH_ICONS.find((i) => i.key === key)!.label;
}
