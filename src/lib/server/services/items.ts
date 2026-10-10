import type { StickerStatus } from '@prisma/client';
import { z } from 'zod';
import { db, type Tx } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { mergeParams, paramListSchema, type MergedParam, type ParamView } from '$lib/domain/params';
import { getParamsOf, replaceParams } from './params';
import { assertCanPlace, assertIsContainer, getPath, type PathNode } from './paths';
import { notTaken, partCount, placePart } from './split';
import { bindSticker } from './stickers';
import { findOrCreateType } from './types';

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
const typeChoice = {
	typeId: z.uuid().optional(),
	newTypeName: z.string().trim().min(1).max(200).optional()
};

export const createItemSchema = z
	.object({
		...typeChoice,
		name: ownName,
		quantity: quantity.default(1),
		parentId: z.uuid().nullish(),
		isContainer: z.boolean().default(false),
		stickerCode: z.string().trim().min(1).optional(),
		params: paramListSchema.optional()
	})
	.refine((v) => Boolean(v.typeId) !== Boolean(v.newTypeName), {
		message: 'Выберите тип или введите название нового',
		path: ['typeId']
	});

export const updateItemSchema = z
	.object({
		...typeChoice,
		name: ownName.optional(),
		quantity: quantity.optional(),
		isContainer: z.boolean().optional()
	})
	.refine((v) => !(v.typeId && v.newTypeName), {
		message: 'Либо существующий тип, либо новый',
		path: ['typeId']
	});

export const moveItemSchema = z.object({
	parentId: z.uuid().nullable(),
	/** Part of the quantity; omitted → the whole record. */
	quantity: z.number().int().positive().optional()
});

/** A container is a single instance: one thing never lies in two identical boxes. */
const CONTAINER_QUANTITY = 'У контейнера количество всегда 1';

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
		isContainer: boolean;
		parentId: string | null;
		homeId: string | null;
		takenById: string | null;
	};
	type: { id: string; name: string; photoKey: string | null } | null;
	sticker: { code: string; status: StickerStatus; caption: string | null } | null;
	path: PathNode[];
	/** Type and item parameters merged (item values override type values with the same key). */
	params: MergedParam[];
	/** The item's own parameters, for editing. */
	itemParams: ParamView[];
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
		include: { type: { select: { name: true } } }
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
 * Creates an item: an existing type or a new one by name, optional own name,
 * container, parameters and a free sticker — all in one transaction.
 */
export async function createItem(actor: Actor, input: unknown): Promise<{ id: string }> {
	const data = createItemSchema.parse(input);
	if (data.isContainer && data.quantity !== 1) throw new ValidationError(CONTAINER_QUANTITY);
	return db.$transaction(async (tx) => {
		const type = data.typeId
			? await findVisibleType(actor, data.typeId, tx)
			: await findOrCreateType(actor, data.newTypeName ?? '', tx);
		if (data.parentId) await findPlaceableParent(actor, data.parentId, tx);
		const item = await tx.item.create({
			data: {
				...ownedBy(actor),
				typeId: type.id,
				name: data.name,
				quantity: data.quantity,
				isContainer: data.isContainer,
				parentId: data.parentId ?? null
			}
		});
		if (data.params?.length) await replaceParams(actor, { itemId: item.id }, data.params, tx);
		if (data.stickerCode) await bindSticker(actor, data.stickerCode, item.id, tx);
		return { id: item.id };
	});
}

/**
 * Changes the own name, quantity (≥ 1), type or container mark of an active,
 * ordinary item. A container's quantity is always 1.
 */
export async function updateItem(actor: Actor, id: string, input: unknown): Promise<void> {
	const data = updateItemSchema.parse(input);
	await db.$transaction(async (tx) => {
		const item = await findItem(actor, id, tx);
		if (item.isWorkbench) throw new ValidationError('Рабочий стол меняется на странице стола');
		if (item.status !== 'ACTIVE') throw new ValidationError('Вещь в архиве');
		const typeId = data.typeId
			? (await findVisibleType(actor, data.typeId, tx)).id
			: data.newTypeName
				? (await findOrCreateType(actor, data.newTypeName, tx)).id
				: undefined;
		if (data.isContainer ?? item.isContainer) {
			if (data.quantity !== undefined && data.quantity !== 1) {
				throw new ValidationError(CONTAINER_QUANTITY);
			}
			if (data.quantity === undefined && item.quantity !== 1) {
				throw new ValidationError(
					`${CONTAINER_QUANTITY}, а их сейчас ${item.quantity} шт. — укажите количество 1`
				);
			}
		}
		if (data.isContainer === false && item.isContainer) {
			const [inside, taken] = await Promise.all([
				tx.item.count({ where: { parentId: id, status: 'ACTIVE' } }),
				tx.item.count({ where: { homeId: id, status: 'ACTIVE', takenById: { not: null } } })
			]);
			if (inside > 0) {
				throw new ValidationError('Внутри лежат вещи — сначала переложите их');
			}
			if (taken > 0) {
				throw new ValidationError('Вещи из него лежат на рабочем столе — сначала верните их');
			}
		}
		await tx.item.update({
			where: { id },
			data: { typeId, name: data.name, quantity: data.quantity, isContainer: data.isContainer }
		});
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
	return db.$transaction(async (tx) => {
		const item = await findItem(actor, itemId, tx);
		if (item.isWorkbench) throw new ValidationError('Рабочий стол нельзя переложить');
		if (item.status !== 'ACTIVE') throw new ValidationError('Вещь в архиве');
		const count = partCount(item, quantity);
		if (parentId) await findPlaceableParent(actor, parentId, tx);
		await assertCanPlace(itemId, parentId, tx);
		return { itemId: await placePart(tx, item, count, { parentId, ...notTaken }) };
	});
}

/** Active items directly inside a container, or at the top level when parentId is null. */
export async function listContents(
	actor: Actor,
	parentId: string | null,
	tx: Tx = db
): Promise<ContentEntry[]> {
	if (parentId) await findItem(actor, parentId, tx);
	const items = await tx.item.findMany({
		where: { parentId, status: 'ACTIVE', isWorkbench: false, ...visibleTo(actor) },
		include: {
			type: { select: { name: true, photoKey: true } },
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
			isContainer: i.isContainer,
			childCount: childCount.get(i.id) ?? 0,
			stickerCode: i.sticker?.status === 'BOUND' ? i.sticker.code : null,
			onWorkbench: i.takenById !== null
		}))
		.sort(
			(a, b) => Number(b.isContainer) - Number(a.isContainer) || a.name.localeCompare(b.name, 'ru')
		);
}

/** Everything the item card shows. Archived items and workbenches have cards too. */
export async function getItemCard(actor: Actor, id: string): Promise<ItemCard> {
	const item = await db.item.findFirst({
		where: { id, ...visibleTo(actor) },
		include: { type: true, sticker: true }
	});
	if (!item) throw new NotFoundError('Вещь не найдена');
	const [path, typeParams, itemParams, children] = await Promise.all([
		getPath(id),
		item.typeId ? getParamsOf(actor, 'typeId', [item.typeId]) : null,
		getParamsOf(actor, 'itemId', [id]),
		item.isContainer || item.isWorkbench ? listContents(actor, id) : []
	]);
	const own = itemParams.get(id) ?? [];
	return {
		item: {
			id: item.id,
			name: item.name,
			displayName: itemDisplayName(item),
			quantity: item.quantity,
			status: item.status,
			archivedAt: item.archivedAt,
			isWorkbench: item.isWorkbench,
			isContainer: item.isContainer || item.isWorkbench,
			parentId: item.parentId,
			homeId: item.homeId,
			takenById: item.takenById
		},
		type: item.type
			? { id: item.type.id, name: item.type.name, photoKey: item.type.photoKey }
			: null,
		sticker: item.sticker
			? { code: item.sticker.code, status: item.sticker.status, caption: item.sticker.caption }
			: null,
		path,
		params: mergeParams(typeParams?.get(item.typeId ?? '') ?? [], own),
		itemParams: own,
		children
	};
}
