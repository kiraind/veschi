import type { StickerStatus } from '@prisma/client';
import { z } from 'zod';
import { idSchema } from '$lib/domain/id';
import { db, type Tx, writeTransaction } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { compareNames, itemDisplayName } from '$lib/domain/item';
import { inheritedParams, paramListSchema, type ParamView } from '$lib/domain/params';
import { diffFields } from '$lib/domain/history';
import { itemRef, itemSubject, placeRef, recordEvent } from './history';
import { getParamsOf, replaceParams } from './params';
import {
	assertCanPlace,
	assertIsContainer,
	containerTypeInclude,
	getPath,
	isContainerItem,
	type PathNode
} from './paths';
import { notTaken, partCount, placePart } from './split';
import { bindSticker } from './stickers';
import { setBarcode } from './barcodes';
import { requireWorkbench } from './workbench';
import { CONTAINER_QUANTITY, findOrCreateType } from './types';
import { addTypeToCategory, assertItemComplete, categoryInfoOf } from './categories';
import { missingParams, type CategoryRef, type RequiredParam } from '$lib/domain/categories';
import { type StickerWidth, toStickerWidth } from '$lib/domain/sticker-sheet';

const ownName = z
	.string()
	.trim()
	.max(200, 'Название длиннее 200 символов')
	.nullish()
	.transform((v) => v || null);
const quantity = z
	.number()
	.int('Количество — целое число')
	.min(1, 'Количество — не меньше 1')
	.max(1_000_000);

/** A sticker marks one thing, so a stickered record always holds exactly one. */
export const STICKER_QUANTITY =
	'У вещи с наклейкой количество всегда 1: наклейка обозначает одну вещь';

export const createItemSchema = z
	.object({
		typeId: z.optional(idSchema),
		newTypeName: z.string().trim().min(1).max(200).optional(),
		name: ownName,
		quantity: quantity.default(1),
		parentId: z.nullish(idSchema),
		/** Put on this workbench instead of into a container (as if taken from the top level). */
		workbenchId: z.optional(idSchema),
		/** A new type (newTypeName) is a container type. */
		newTypeIsContainer: z.boolean().default(false),
		/** Categories of a new type (newTypeName). */
		newTypeCategoryIds: z.array(idSchema).max(50).default([]),
		stickerCode: z.string().trim().min(1).optional(),
		/** A packaging barcode to link to the type (existing or new). */
		barcode: z.string().trim().min(1).max(40).optional(),
		params: z.optional(paramListSchema)
	})
	.refine((v) => Boolean(v.typeId) !== Boolean(v.newTypeName), {
		message: 'Выберите тип или введите название нового',
		path: ['typeId']
	})
	.refine((v) => !(v.parentId && v.workbenchId), {
		message: 'Вещь кладётся либо в контейнер, либо на стол',
		path: ['workbenchId']
	});

/** The type of an existing item never changes; a new item is created instead. */
export const updateItemSchema = z.object({
	name: ownName.optional(),
	quantity: quantity.optional()
});

export const moveItemSchema = z.object({
	parentId: z.nullable(idSchema),
	/** Part of the quantity; omitted → the whole record. */
	quantity: z.number().int().positive().optional()
});

/** One entry of a container's contents (or of the top level). */
export interface ContentEntry {
	id: string;
	name: string;
	typeName: string | null;
	/** The type's photo. */
	photoKey: string | null;
	quantity: number;
	isContainer: boolean;
	/** Active items directly inside; > 0 means it can be expanded. */
	childCount: number;
	stickerCode: string | null;
	onWorkbench: boolean;
}

export interface ItemCard {
	item: {
		id: string;
		/** Own name (may be empty); see displayName. */
		name: string | null;
		displayName: string;
		quantity: number;
		status: 'ACTIVE' | 'ARCHIVED';
		archivedAt: Date | null;
		isWorkbench: boolean;
		/** Things can be put inside: a workbench or an item of a container type. */
		isContainer: boolean;
		parentId: string | null;
		homeId: string | null;
		takenById: string | null;
	};
	type: {
		id: string;
		name: string;
		description: string | null;
		isContainer: boolean;
		photoKey: string | null;
		/** «Без фото»: the photo area is a strip while there is no photo. */
		noPhoto: boolean;
	} | null;
	sticker: { code: string; status: StickerStatus; caption: string | null } | null;
	/** Width of the sticker ordered for the next batch («Заказать наклейку»), or null. */
	stickerOrder: StickerWidth | null;
	path: PathNode[];
	/** The item's own parameters («Индивидуальные параметры»). */
	itemParams: ParamView[];
	/** The type's parameters an own value does not override («Параметры»). */
	typeParams: ParamView[];
	/** Categories of the type. */
	categories: CategoryRef[];
	/** Required «у каждой вещи» / «у типа» by the type's categories. */
	itemRequired: RequiredParam[];
	typeRequired: RequiredParam[];
	/** Required values not filled: the item's own and its type's. */
	missingItemParams: RequiredParam[];
	missingTypeParams: RequiredParam[];
	children: ContentEntry[];
}

async function findItem(actor: Actor, id: string, tx: Tx = db) {
	const item = await tx.item.findFirst({ where: { id, ...visibleTo(actor) } });
	if (!item) throw new NotFoundError('Вещь не найдена');
	return item;
}

async function findVisibleType(actor: Actor, id: string, tx: Tx) {
	const type = await tx.itemType.findFirst({ where: { id, ...visibleTo(actor) } });
	if (!type) throw new NotFoundError('Тип не найден');
	return type;
}

/** A container new or moved items may go into: an active ordinary item marked as a container. */
async function findPlaceableParent(actor: Actor, parentId: string, tx: Tx) {
	const parent = await tx.item.findFirst({
		where: { id: parentId, ...visibleTo(actor) },
		include: containerTypeInclude
	});
	if (!parent) throw new NotFoundError('Контейнер не найден');
	if (parent.status !== 'ACTIVE') throw new ValidationError('Контейнер в архиве');
	if (parent.isWorkbench) {
		throw new ValidationError('На рабочий стол вещи попадают кнопкой «На стол»');
	}
	assertIsContainer(parent);
	return parent;
}

/**
 * Creates an item: an existing type or a new one by name (optionally a
 * container type, put into categories), own name, parameters, a free sticker and a
 * packaging barcode for the type — all in one
 * transaction. Items of a container type have quantity 1. With `workbenchId` the item
 * lies on that bench as taken by the actor, its home being the top level.
 */
export async function createItem(actor: Actor, input: unknown): Promise<{ id: string }> {
	const data = createItemSchema.parse(input);
	return writeTransaction(async (tx) => {
		const type = data.typeId
			? await findVisibleType(actor, data.typeId, tx)
			: await findOrCreateType(actor, data.newTypeName ?? '', tx, {
					isContainer: data.newTypeIsContainer
				});
		if (type.isContainer && data.quantity !== 1) throw new ValidationError(CONTAINER_QUANTITY);
		if (data.stickerCode && data.quantity !== 1) throw new ValidationError(STICKER_QUANTITY);
		if (data.parentId) await findPlaceableParent(actor, data.parentId, tx);
		const bench = data.workbenchId ? await requireWorkbench(actor, data.workbenchId, tx) : null;
		if (data.barcode) await setBarcode(actor, type.id, data.barcode, {}, tx);
		if (!data.typeId) {
			for (const categoryId of new Set(data.newTypeCategoryIds)) {
				await addTypeToCategory(actor, type.id, categoryId, tx);
			}
		}
		await assertItemComplete(type.id, data.params ?? [], tx);
		const item = await tx.item.create({
			data: {
				...ownedBy(actor),
				typeId: type.id,
				name: data.name,
				quantity: data.quantity,
				...(bench
					? {
							parentId: bench.id,
							takenById: actor.userId,
							takenAt: new Date(),
							homeId: null,
							createdOnBench: true
						}
					: { parentId: data.parentId ?? null })
			}
		});
		if (bench) {
			await tx.user.update({ where: { id: actor.userId }, data: { lastWorkbenchId: bench.id } });
		}
		await recordEvent(tx, actor, {
			kind: 'item.created',
			subject: itemRef({ ...item, type }),
			data: { quantity: item.quantity, to: await placeRef(tx, item.parentId) },
			// Its parameters too, so the history of a parameter shows items created with it.
			refIds: [type.id, ...(data.params ?? []).map((p) => p.defId)]
		});
		if (data.params?.length) {
			await replaceParams(actor, { itemId: item.id }, data.params, tx, { record: false });
		}
		if (data.stickerCode) await bindSticker(actor, data.stickerCode, item.id, tx);
		return { id: item.id };
	});
}

/**
 * Changes the own name or quantity (≥ 1) of an active, ordinary item. The
 * quantity of a container or of an item with a sticker is always 1.
 */
export async function updateItem(actor: Actor, id: string, input: unknown): Promise<void> {
	const data = updateItemSchema.parse(input);
	await writeTransaction(async (tx) => {
		const item = await tx.item.findFirst({
			where: { id, ...visibleTo(actor) },
			include: { type: true, sticker: true }
		});
		if (!item) throw new NotFoundError('Вещь не найдена');
		if (item.isWorkbench) throw new ValidationError('Рабочий стол меняется на странице стола');
		if (item.status !== 'ACTIVE') throw new ValidationError('Вещь в архиве');
		if (data.quantity !== undefined && data.quantity !== item.quantity) {
			if (item.type?.isContainer) throw new ValidationError(CONTAINER_QUANTITY);
			if (item.sticker?.status === 'BOUND') throw new ValidationError(STICKER_QUANTITY);
		}
		await tx.item.update({ where: { id }, data: { name: data.name, quantity: data.quantity } });
		const changes = diffFields({ name: item.name, quantity: item.quantity }, data);
		if (changes.length) {
			await recordEvent(tx, actor, {
				kind: 'item.updated',
				subject: itemRef({ ...item, name: data.name === undefined ? item.name : data.name }),
				data: { changes }
			});
		}
	});
}

/**
 * Puts an item, or part of its quantity, into another container (or the top
 * level, parentId = null). Cycles and workbenches as targets are rejected.
 * What moves leaves a workbench: its home container and split source are
 * forgotten. A part splits the record like «На стол»: the source keeps the
 * rest (and, on a bench, its taken state), its sticker and its own params.
 * Returns the id of the moved record.
 */
export async function moveItem(
	actor: Actor,
	itemId: string,
	parentId: string | null,
	{ quantity }: { quantity?: number } = {}
): Promise<{ itemId: string }> {
	return writeTransaction(async (tx) => {
		const item = await findItem(actor, itemId, tx);
		if (item.isWorkbench) throw new ValidationError('Рабочий стол нельзя переложить');
		if (item.status !== 'ACTIVE') throw new ValidationError('Вещь в архиве');
		const count = partCount(item, quantity);
		if (parentId === item.parentId && !item.takenById) {
			throw new ValidationError('Вещь уже лежит здесь');
		}
		if (parentId) await findPlaceableParent(actor, parentId, tx);
		await assertCanPlace(itemId, parentId, tx);
		const subject = await itemSubject(tx, item.id);
		const from = await placeRef(tx, item.parentId);
		const to = await placeRef(tx, parentId);
		const resultId = await placePart(tx, item, count, { parentId, ...notTaken });
		await recordEvent(tx, actor, {
			kind: 'item.moved',
			subject,
			data: { quantity: count, of: item.quantity, from, to, resultId }
		});
		return { itemId: resultId };
	});
}

/** Active items directly inside a container, or at the top level when parentId is null; alphabetical. */
export async function listContents(
	actor: Actor,
	parentId: string | null,
	tx: Tx = db
): Promise<ContentEntry[]> {
	if (parentId) await findItem(actor, parentId, tx);
	return contentsOf(actor, parentId, tx);
}

/** listContents for a parent that is already checked to be visible. */
async function contentsOf(
	actor: Actor,
	parentId: string | null,
	tx: Tx = db
): Promise<ContentEntry[]> {
	const items = await tx.item.findMany({
		where: { parentId, status: 'ACTIVE', isWorkbench: false, ...visibleTo(actor) },
		include: {
			type: { select: { name: true, photoKey: true, isContainer: true } },
			sticker: { select: { code: true, status: true } }
		}
	});
	const counts = items.length
		? await tx.item.groupBy({
				by: ['parentId'],
				where: {
					parentId: { in: items.map((i) => i.id) },
					status: 'ACTIVE',
					...visibleTo(actor)
				},
				_count: { _all: true }
			})
		: [];
	const childCount = new Map(counts.map((c) => [c.parentId, c._count._all]));
	return items
		.map((i) => ({
			id: i.id,
			name: itemDisplayName(i),
			typeName: i.type?.name ?? null,
			photoKey: i.type?.photoKey ?? null,
			quantity: i.quantity,
			isContainer: isContainerItem(i),
			childCount: childCount.get(i.id) ?? 0,
			stickerCode: i.sticker?.status === 'BOUND' ? i.sticker.code : null,
			onWorkbench: i.takenById !== null
		}))
		.sort(
			(a, b) =>
				compareNames(a.name, b.name) ||
				// The same thing in several records: the bigger one first, then by sticker ID.
				b.quantity - a.quantity ||
				(a.stickerCode ?? '').localeCompare(b.stickerCode ?? '') ||
				a.id.localeCompare(b.id)
		);
}

/** Name and path of an item, without the rest of its card (the container of a new item). */
export async function getItemSummary(
	actor: Actor,
	id: string
): Promise<{ id: string; name: string; path: PathNode[] }> {
	const [item, path] = await Promise.all([
		db.item.findFirst({
			where: { id, ...visibleTo(actor) },
			include: { type: { select: { name: true } } }
		}),
		getPath(id)
	]);
	if (!item) throw new NotFoundError('Вещь не найдена');
	return { id: item.id, name: itemDisplayName(item), path };
}

/** Everything the item card shows. Archived items and workbenches have cards too. */
export async function getItemCard(actor: Actor, id: string): Promise<ItemCard> {
	const item = await db.item.findFirst({
		where: { id, ...visibleTo(actor) },
		include: { type: true, sticker: true }
	});
	if (!item) throw new NotFoundError('Вещь не найдена');
	const [path, typeParams, itemParams, children, categories] = await Promise.all([
		getPath(id),
		item.typeId ? getParamsOf(actor, 'typeId', [item.typeId]) : null,
		getParamsOf(actor, 'itemId', [id]),
		isContainerItem(item) ? contentsOf(actor, id) : [],
		item.typeId ? categoryInfoOf(item.typeId) : null
	]);
	const own = itemParams.get(id) ?? [];
	const ofType = typeParams?.get(item.typeId ?? '') ?? [];
	return {
		item: {
			id: item.id,
			name: item.name,
			displayName: itemDisplayName(item),
			quantity: item.quantity,
			status: item.status,
			archivedAt: item.archivedAt,
			isWorkbench: item.isWorkbench,
			isContainer: isContainerItem(item),
			parentId: item.parentId,
			homeId: item.homeId,
			takenById: item.takenById
		},
		type: item.type
			? {
					id: item.type.id,
					name: item.type.name,
					description: item.type.description,
					isContainer: item.type.isContainer,
					photoKey: item.type.photoKey,
					noPhoto: item.type.noPhoto
				}
			: null,
		sticker: item.sticker
			? { code: item.sticker.code, status: item.sticker.status, caption: item.sticker.caption }
			: null,
		stickerOrder: item.stickerOrderedAt ? toStickerWidth(item.stickerOrderWidth) : null,
		path,
		itemParams: own,
		typeParams: inheritedParams(ofType, own),
		categories: categories?.categories ?? [],
		itemRequired: categories?.itemRequired ?? [],
		typeRequired: categories?.typeRequired ?? [],
		missingItemParams: missingParams(categories?.itemRequired ?? [], own),
		missingTypeParams: missingParams(categories?.typeRequired ?? [], ofType),
		children
	};
}
