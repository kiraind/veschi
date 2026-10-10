import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ItemType } from '@prisma/client';
import { z } from 'zod';
import { db, type Tx } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { itemDisplayName } from '$lib/domain/item';
import type { ParamView } from '$lib/domain/params';
import { deleteStored, deleteUnreferencedFiles, thumbKeyOf } from './files';
import { diffFields } from '$lib/domain/history';
import { recordEvent, typeRef } from './history';
import { getParamsOf } from './params';
import { assertNothingInside, countContents, getPaths, type PathNode } from './paths';

/** Side of a stored photo (square), px: full size and thumbnail. */
const PHOTO_MAX_SIDE = 2048;
const PHOTO_THUMB_SIDE = 320;

export const typeNameSchema = z.string().trim().min(1, 'Укажите название').max(200);
export const typeDescriptionSchema = z
	.string()
	.trim()
	.max(2000, 'Описание длиннее 2000 символов')
	.nullish()
	.transform((v) => v || null);

/** A new type. */
export const typeInputSchema = z.object({
	name: typeNameSchema,
	description: typeDescriptionSchema.optional(),
	isContainer: z.boolean().optional()
});

/** Changes of a type: omitted fields stay as they are. */
export const typeUpdateSchema = typeInputSchema.partial();

/** A container is a single instance: one thing never lies in two identical boxes. */
export const CONTAINER_QUANTITY = 'У контейнера количество всегда 1';

export interface TypeSummary {
	id: string;
	name: string;
	description: string | null;
	isContainer: boolean;
	photoKey: string | null;
	/** Active items of this type (records, not quantity). */
	itemCount: number;
}

export interface TypeInfo {
	id: string;
	name: string;
	description: string | null;
	isContainer: boolean;
	photoKey: string | null;
}

export interface TypeCard {
	type: TypeInfo;
	params: ParamView[];
	items: { id: string; name: string; quantity: number; path: PathNode[] }[];
	/** A container type whose items hold something (or have things taken out to a bench). */
	hasContents: boolean;
}

async function findType(actor: Actor, id: string, tx: Tx = db) {
	const type = await tx.itemType.findFirst({ where: { id, ...visibleTo(actor) } });
	if (!type) throw new NotFoundError('Тип не найден');
	return type;
}

function typeInfo(t: TypeInfo): TypeInfo {
	return {
		id: t.id,
		name: t.name,
		description: t.description,
		isContainer: t.isContainer,
		photoKey: t.photoKey
	};
}

export async function getType(actor: Actor, id: string): Promise<TypeInfo> {
	return typeInfo(await findType(actor, id));
}

/** Types sorted by name; with `query`, a name or description substring filter (autocomplete). */
export async function listTypes(
	actor: Actor,
	query?: string,
	limit = query ? 20 : 1000
): Promise<TypeSummary[]> {
	const q = query?.trim();
	const types = await db.itemType.findMany({
		where: {
			...visibleTo(actor),
			...(q
				? {
						OR: [
							{ name: { contains: q, mode: 'insensitive' } },
							{ description: { contains: q, mode: 'insensitive' } }
						]
					}
				: {})
		},
		include: { _count: { select: { items: { where: { status: 'ACTIVE' } } } } },
		orderBy: { name: 'asc' },
		take: limit
	});
	return types.map((t) => ({ ...typeInfo(t), itemCount: t._count.items }));
}

/** A type with its parameters and every active item of it with its location. */
export async function getTypeCard(actor: Actor, id: string): Promise<TypeCard> {
	const type = await findType(actor, id);
	const [params, items] = await Promise.all([
		getParamsOf(actor, 'typeId', [id]),
		db.item.findMany({
			where: { typeId: id, status: 'ACTIVE', ...visibleTo(actor) },
			include: { type: { select: { name: true } } },
			orderBy: { createdAt: 'asc' }
		})
	]);
	const [paths, contents] = await Promise.all([
		getPaths(items.map((i) => i.id)),
		type.isContainer ? countContents(items.map((i) => i.id)) : { inside: 0, taken: 0 }
	]);
	return {
		type: typeInfo(type),
		hasContents: contents.inside + contents.taken > 0,
		params: params.get(id) ?? [],
		items: items.map((i) => ({
			id: i.id,
			name: itemDisplayName(i),
			quantity: i.quantity,
			path: paths.get(i.id) ?? []
		}))
	};
}

export async function createType(actor: Actor, input: unknown, tx?: Tx): Promise<ItemType> {
	if (!tx) return db.$transaction((t) => createType(actor, input, t));
	const { name, description, isContainer } = typeInputSchema.parse(input);
	const type = await tx.itemType.create({
		data: { name, description, isContainer, ...ownedBy(actor) }
	});
	await recordEvent(tx, actor, { kind: 'type.created', subject: typeRef(type), data: {} });
	return type;
}

/**
 * The type with this name (case-insensitive), created when there is none
 * (with `isContainer`; an existing type keeps its own mark).
 */
export async function findOrCreateType(
	actor: Actor,
	rawName: string,
	tx: Tx = db,
	{ isContainer = false }: { isContainer?: boolean } = {}
) {
	const name = typeNameSchema.parse(rawName);
	const existing = await tx.itemType.findFirst({
		where: { name: { equals: name, mode: 'insensitive' }, ...visibleTo(actor) },
		orderBy: { createdAt: 'asc' }
	});
	return existing ?? createType(actor, { name, isContainer }, tx);
}

/**
 * Changes the name, description or container mark. A type becomes a
 * container only when each of its items (archived ones too) has quantity 1,
 * and stops being one only when nothing lies in its items.
 */
export async function updateType(actor: Actor, id: string, input: unknown) {
	const { name, description, isContainer } = typeUpdateSchema.parse(input);
	return db.$transaction(async (tx) => {
		const type = await findType(actor, id, tx);
		if (isContainer === true && !type.isContainer) {
			const several = await tx.item.findFirst({
				where: { typeId: id, quantity: { gt: 1 } },
				include: { type: { select: { name: true } } }
			});
			if (several) {
				throw new ValidationError(
					`${CONTAINER_QUANTITY}, а у «${itemDisplayName(several)}» ${several.quantity} шт. — сначала разделите или измените количество`
				);
			}
		}
		if (isContainer === false && type.isContainer) {
			const items = await tx.item.findMany({ where: { typeId: id }, select: { id: true } });
			await assertNothingInside(
				items.map((i) => i.id),
				tx
			);
		}
		const updated = await tx.itemType.update({
			where: { id },
			data: { name, description, isContainer }
		});
		const changes = diffFields(
			{ name: type.name, description: type.description, isContainer: type.isContainer },
			{ name, description, isContainer }
		);
		if (changes.length) {
			await recordEvent(tx, actor, {
				kind: 'type.updated',
				subject: typeRef(updated),
				data: { changes }
			});
		}
		return updated;
	});
}

/** Deletes a type nothing refers to: no items (archived ones count) and no REF parameters. */
export async function deleteType(actor: Actor, id: string): Promise<void> {
	const type = await findType(actor, id);
	const [items, refs] = await Promise.all([
		db.item.count({ where: { typeId: id } }),
		db.param.count({ where: { refTypeId: id } })
	]);
	if (items > 0)
		throw new ConflictError('Нельзя удалить тип: у него есть вещи (в том числе в архиве)');
	if (refs > 0) throw new ConflictError('Нельзя удалить тип: на него ссылаются параметры');
	const fileKeys = (
		await db.param.findMany({ where: { typeId: id }, select: { fileKey: true } })
	).flatMap((p) => (p.fileKey ? [p.fileKey] : []));
	await db.$transaction(async (tx) => {
		await recordEvent(tx, actor, { kind: 'type.deleted', subject: typeRef(type), data: {} });
		await tx.itemType.delete({ where: { id } });
	});
	await deleteUnreferencedFiles([...fileKeys, ...(type.photoKey ? [type.photoKey] : [])]);
}

/** A photo in the two stored sizes: full (for the photo itself) and a thumbnail (lists). */
export interface PhotoVariants {
	full: Buffer;
	thumb: Buffer;
}

/**
 * Re-encodes an uploaded photo to two square WebPs (EXIF rotation applied):
 * the full one up to PHOTO_MAX_SIDE and a PHOTO_THUMB_SIDE thumbnail. The
 * picture is centred and padded with transparent margins, never cropped or
 * enlarged.
 */
export async function toWebp(data: Buffer): Promise<PhotoVariants> {
	try {
		const { data: pixels, info } = await sharp(data)
			.rotate()
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const longest = Math.max(info.width, info.height);
		const square = (side: number, quality: number) =>
			sharp(pixels, { raw: { width: info.width, height: info.height, channels: info.channels } })
				.resize({
					width: side,
					height: side,
					fit: 'contain',
					background: { r: 0, g: 0, b: 0, alpha: 0 }
				})
				.webp({ quality })
				.toBuffer();
		const [full, thumb] = await Promise.all([
			square(Math.min(longest, PHOTO_MAX_SIDE), 88),
			square(Math.min(longest, PHOTO_THUMB_SIDE), 75)
		]);
		return { full, thumb };
	} catch {
		throw new ValidationError('Не удалось прочитать изображение (подходят JPEG, PNG, WebP, GIF)');
	}
}

/** Sets the type's photo; the previous photo is deleted. Returns the new key. */
export async function setTypePhoto(actor: Actor, id: string, data: Buffer): Promise<string> {
	const type = await findType(actor, id);
	const { full, thumb } = await toWebp(data);
	const photoKey = `types/${id}/${randomUUID()}.webp`;
	await storage().put(photoKey, full, 'image/webp');
	await storage().put(thumbKeyOf(photoKey), thumb, 'image/webp');
	await db.$transaction(async (tx) => {
		await tx.itemType.update({ where: { id }, data: { photoKey } });
		await recordEvent(tx, actor, {
			kind: 'type.photo',
			subject: typeRef(type),
			data: { removed: false }
		});
	});
	if (type.photoKey) await deleteStored(type.photoKey);
	return photoKey;
}

export async function removeTypePhoto(actor: Actor, id: string): Promise<void> {
	const type = await findType(actor, id);
	if (!type.photoKey) return;
	await db.$transaction(async (tx) => {
		await tx.itemType.update({ where: { id }, data: { photoKey: null } });
		await recordEvent(tx, actor, {
			kind: 'type.photo',
			subject: typeRef(type),
			data: { removed: true }
		});
	});
	await deleteStored(type.photoKey);
}
