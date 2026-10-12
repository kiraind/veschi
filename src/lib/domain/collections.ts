/**
 * Collections («Коллекции»): a named list of things and how many of each —
 * the parts of a project («Умные весы»), a packing list. A line is either any
 * things of a type («ESP32 — 3 штуки») or one particular item («эти кухонные
 * весы»). Input validation and how a line's availability reads. Pure
 * functions, shared by the server and the browser.
 */
import { z } from 'zod';
import { idSchema } from './id';
import { pieces, plural } from './plural';

/** Most lines in one collection. */
export const MAX_COLLECTION_ENTRIES = 500;

/** Largest quantity of one line. */
export const MAX_ENTRY_QUANTITY = 1_000_000;

export const collectionNameSchema = z
	.string()
	.trim()
	.min(1, 'Укажите название коллекции')
	.max(100, 'Название длиннее 100 символов');

export const collectionDescriptionSchema = z
	.string()
	.trim()
	.max(2000, 'Описание длиннее 2000 символов')
	.nullish()
	.transform((v) => v || null);

export const collectionInputSchema = z.object({
	name: collectionNameSchema,
	description: collectionDescriptionSchema.optional()
});

/** Changes of a collection: omitted fields stay as they are. */
export const collectionUpdateSchema = collectionInputSchema.partial();

export const entryQuantitySchema = z
	.number({ error: 'Укажите количество' })
	.int('Количество — целое число')
	.min(1, 'Количество — не меньше 1')
	.max(MAX_ENTRY_QUANTITY, `Количество — не больше ${MAX_ENTRY_QUANTITY}`);

/**
 * A new line and how many: a type (`typeId`, or `typeName` — the type with
 * that name, created when there is none yet) or an item; exactly one of the
 * three. Adding a type or item that is already in the collection adds to its
 * quantity.
 */
export const entryInputSchema = z
	.object({
		typeId: idSchema.optional(),
		typeName: z.string().trim().min(1).max(200).optional(),
		itemId: idSchema.optional(),
		quantity: entryQuantitySchema.default(1)
	})
	.refine((e) => [e.typeId, e.typeName, e.itemId].filter(Boolean).length === 1, {
		message: 'Укажите тип или вещь'
	});

export type EntryInput = z.infer<typeof entryInputSchema>;

/** Changes of a line: only its quantity. */
export const entryUpdateSchema = z.object({ quantity: entryQuantitySchema });

export interface CollectionRef {
	id: string;
	name: string;
}

/** What a line needs and what there is of it. */
export type EntryStock =
	/** Any things of the type: `have` — active items of it, all places together. */
	| { kind: 'type'; have: number }
	/** One item record: its quantity, where it lies, whether it was thrown away. */
	| {
			kind: 'item';
			have: number;
			archived: boolean;
			path: { id: string; name: string; isWorkbench: boolean }[];
	  };

/** One line of a collection as its page shows it. */
export interface CollectionEntryView {
	id: string;
	kind: 'type' | 'item';
	/** The type or item the line is about. */
	targetId: string;
	name: string;
	/** The type's name under an item's own name, when they differ. */
	typeName: string | null;
	photoKey: string | null;
	isContainer: boolean;
	stickerCode: string | null;
	quantity: number;
	stock: EntryStock;
}

/** A collection as listed on the «Коллекции» page. */
export interface CollectionSummary extends CollectionRef {
	description: string | null;
	entryCount: number;
	/** Lines with fewer things than needed. */
	shortCount: number;
	/** Photos of the first lines, for the row's strip. */
	photos: { photoKey: string | null; isContainer: boolean }[];
}

/** How many more are needed for the line (0 when there are enough). */
export function shortage(entry: Pick<CollectionEntryView, 'quantity' | 'stock'>): number {
	if (entry.stock.kind === 'item' && entry.stock.archived) return entry.quantity;
	return Math.max(0, entry.quantity - entry.stock.have);
}

/**
 * What the line's subtitle says about stock: «есть 5 штук», «есть 1, не хватает 2»,
 * «нет ни одной», «в архиве». `ok` — there are enough.
 */
export function stockText(entry: Pick<CollectionEntryView, 'quantity' | 'stock'>): {
	text: string;
	ok: boolean;
} {
	const { stock } = entry;
	if (stock.kind === 'item' && stock.archived) return { text: 'в архиве', ok: false };
	const missing = shortage(entry);
	if (stock.have === 0) return { text: 'нет ни одной', ok: false };
	if (missing > 0) return { text: `есть ${stock.have}, не хватает ${missing}`, ok: false };
	// An item record holding exactly what's needed says nothing more than its place.
	if (stock.kind === 'item') return { text: '', ok: true };
	return { text: `есть ${pieces(stock.have)}`, ok: true };
}

/** «3 позиции», «нет вещей». */
export function entryCountText(count: number): string {
	return count ? `${count} ${plural(count, ['позиция', 'позиции', 'позиций'])}` : 'пусто';
}

/** «не хватает 2 позиций» for a collection row. */
export function shortCountText(count: number): string {
	return `не хватает ${count} ${plural(count, ['позиции', 'позиций', 'позиций'])}`;
}
