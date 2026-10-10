import type { StickerStatus } from '@prisma/client';
import { z } from 'zod';
import { db, type Tx } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { inheritedParams, paramListSchema, type ParamView } from '$lib/domain/params';
import { getParamsOf, replaceParams } from './params';
import {
	assertCanPlace,
	assertIsContainer,
	assertNothingInside,
	containerTypeInclude,
	getPath,
	isContainerItem,
	type PathNode
} from './paths';
import { notTaken, partCount, placePart } from './split';
import { bindSticker } from './stickers';
import { CONTAINER_QUANTITY, findOrCreateType } from './types';

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
		/** A new type (newTypeName) is a container type. */
		newTypeIsContainer: z.boolean().default(false),
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
		quantity: quantity.optional()
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
	} | null;
	sticker: { code: string; status: StickerStatus; caption: string | null } | null;
	path: PathNode[];
	/** The item's own parameters («Индивидуальные параметры»). */
	itemParams: ParamView[];
	/** The type's parameters an own value does not override («Параметры»). */
	typeParams: ParamView[];
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
 * container type), own name, parameters and a free sticker — all in one
 * transaction. Items of a container type have quantity 1.
 */
export async function createItem(actor: Actor, input: unknown): Promise<{ id: string }> {
	const data = createItemSchema.parse(input);
	return db.$transaction(async (tx) => {
		const type = data.typeId
			? await findVisibleType(actor, data.typeId, tx)
			: await findOrCreateType(actor, data.newTypeName ?? '', tx, {
					isContainer: data.newTypeIsContainer
				});
		if (type.isContainer && data.quantity !== 1) throw new ValidationError(CONTAINER_QUANTITY);
		if (data.parentId) await findPlaceableParent(actor, data.parentId, tx);
		const item = await tx.item.create({
			data: {
				...ownedBy(actor),
				typeId: type.id,
				name: data.name,
				quantity: data.quantity,
				parentId: data.parentId ?? null
			}
		});
		if (data.params?.length) await replaceParams(actor, { itemId: item.id }, data.params, tx);
		if (data.stickerCode) await bindSticker(actor, data.stickerCode, item.id, tx);
		return { id: item.id };
	});
}

/**
 * Changes the own name, quantity (≥ 1) or type of an active, ordinary item.
 * An item of a container type has quantity 1; moving a container to a
 * non-container type needs it empty.
 */
export async function updateItem(actor: Actor, id: string, input: unknown): Promise<void> {
	const data = updateItemSchema.parse(input);
	await db.$transaction(async (tx) => {
		const item = await tx.item.findFirst({
			where: { id, ...visibleTo(actor) },
			include: { type: true }
		});
		if (!item) throw new NotFoundError('Вещь не найдена');
		if (item.isWorkbench) throw new ValidationError('Рабочий стол меняется на странице стола');
		if (item.status !== 'ACTIVE') throw new ValidationError('Вещь в архиве');
		const type = data.typeId
			? await findVisibleType(actor, data.typeId, tx)
			: data.newTypeName
				? await findOrCreateType(actor, data.newTypeName, tx)
				: item.type;
		if (type?.isContainer) {
			if (data.quantity !== undefined && data.quantity !== 1) {
				throw new ValidationError(CONTAINER_QUANTITY);
			}
			if (data.quantity === undefined && item.quantity !== 1) {
				throw new ValidationError(
					`${CONTAINER_QUANTITY}, а их сейчас ${item.quantity} шт. — укажите количество 1`
				);
			}
		}
		if (item.type?.isContainer && !type?.isContainer) {
			await assertNothingInside(id, tx);
		}
		await tx.item.update({
			where: { id },
			data: { typeId: type?.id, name: data.name, quantity: data.quantity }
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
		if (parentId === item.parentId && !item.takenById) {
			throw new ValidationError('Вещь уже лежит здесь');
		}
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
		isContainerItem(item) ? listContents(actor, id) : []
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
					photoKey: item.type.photoKey
				}
			: null,
		sticker: item.sticker
			? { code: item.sticker.code, status: item.sticker.status, caption: item.sticker.caption }
			: null,
		path,
		itemParams: own,
		typeParams: inheritedParams(typeParams?.get(item.typeId ?? '') ?? [], own),
		children
	};
}
