/** Name shown for an item: its own name, else its type's name. */
export function itemDisplayName(item: {
	name?: string | null;
	type?: { name: string } | null;
}): string {
	const own = item.name?.trim();
	if (own) return own;
	return item.type?.name ?? 'Без названия';
}

/** Name of a path node; workbenches read as «Рабочий стол Гараж». */
export function pathNodeName(node: { name: string; isWorkbench?: boolean }): string {
	return node.isWorkbench ? `Рабочий стол ${node.name}` : node.name;
}

/** Joins a container path for display: «Шкаф → Полка 2 → Коробка». */
export function formatPath(path: { name: string; isWorkbench?: boolean }[]): string {
	return path.map(pathNodeName).join(' → ');
}

const nameCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/**
 * Alphabetical order of names as people read it: case is ignored and numbers
 * compare by value («Винт M3» before «Винт M10», «Полка 2» before «Полка 10»).
 */
export function compareNames(a: string, b: string): number {
	return nameCollator.compare(a, b);
}
