import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { db, type Tx } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { storage } from '$lib/server/storage';
import { itemDisplayName } from '$lib/domain/item';
import type { ParamView } from '$lib/domain/params';
import { deleteUnreferencedFiles } from './files';
import { getParamsOf } from './params';
import { getPaths, type PathNode } from './paths';

/** Longest side of a stored photo, px. */
const PHOTO_MAX_SIDE = 1600;

export const typeNameSchema = z.string().trim().min(1, 'Укажите название').max(200);
export const typeInputSchema = z.object({ name: typeNameSchema });

export interface TypeSummary {
	id: string;
	name: string;
	photoKey: string | null;
	/** Active items of this type (records, not quantity). */
	itemCount: number;
}

export interface TypeCard {
	type: { id: string; name: string; photoKey: string | null };
	params: ParamView[];
	items: { id: string; name: string; quantity: number; path: PathNode[] }[];
}

async function findType(actor: Actor, id: string, tx: Tx = db) {
	const type = await tx.itemType.findFirst({ where: { id, ...visibleTo(actor) } });
	if (!type) throw new NotFoundError('Тип не найден');
	return type;
}

export async function getType(actor: Actor, id: string): Promise<TypeCard['type']> {
	const { name, photoKey } = await findType(actor, id);
	return { id, name, photoKey };
}

/** Types sorted by name; with `query`, a name substring filter for autocomplete. */
export async function listTypes(
	actor: Actor,
	query?: string,
	limit = query ? 20 : 1000
): Promise<TypeSummary[]> {
	const q = query?.trim();
	const types = await db.itemType.findMany({
		where: { ...visibleTo(actor), ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) },
		include: { _count: { select: { items: { where: { status: 'ACTIVE' } } } } },
		orderBy: { name: 'asc' },
		take: limit
	});
	return types.map((t) => ({
		id: t.id,
		name: t.name,
		photoKey: t.photoKey,
		itemCount: t._count.items
	}));
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
	const paths = await getPaths(items.map((i) => i.id));
	return {
		type: { id: type.id, name: type.name, photoKey: type.photoKey },
		params: params.get(id) ?? [],
		items: items.map((i) => ({
			id: i.id,
			name: itemDisplayName(i),
			quantity: i.quantity,
			path: paths.get(i.id) ?? []
		}))
	};
}

export async function createType(actor: Actor, input: unknown, tx: Tx = db) {
	const { name } = typeInputSchema.parse(input);
	return tx.itemType.create({ data: { name, ...ownedBy(actor) } });
}

/** The type with this name (case-insensitive), created when there is none. */
export async function findOrCreateType(actor: Actor, rawName: string, tx: Tx = db) {
	const name = typeNameSchema.parse(rawName);
	const existing = await tx.itemType.findFirst({
		where: { name: { equals: name, mode: 'insensitive' }, ...visibleTo(actor) },
		orderBy: { createdAt: 'asc' }
	});
	return existing ?? createType(actor, { name }, tx);
}

export async function updateType(actor: Actor, id: string, input: unknown) {
	const { name } = typeInputSchema.parse(input);
	await findType(actor, id);
	return db.itemType.update({ where: { id }, data: { name } });
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
	await db.itemType.delete({ where: { id } });
	await deleteUnreferencedFiles([...fileKeys, ...(type.photoKey ? [type.photoKey] : [])]);
}

/** Re-encodes an uploaded photo to WebP (≤1600 px, EXIF rotation applied). */
export async function toWebp(data: Buffer): Promise<Buffer> {
	try {
		return await sharp(data)
			.rotate()
			.resize({
				width: PHOTO_MAX_SIDE,
				height: PHOTO_MAX_SIDE,
				fit: 'inside',
				withoutEnlargement: true
			})
			.webp({ quality: 82 })
			.toBuffer();
	} catch {
		throw new ValidationError('Не удалось прочитать изображение (подходят JPEG, PNG, WebP, GIF)');
	}
}

/** Sets the type's photo; the previous photo is deleted. Returns the new key. */
export async function setTypePhoto(actor: Actor, id: string, data: Buffer): Promise<string> {
	const type = await findType(actor, id);
	const webp = await toWebp(data);
	const photoKey = `types/${id}/${randomUUID()}.webp`;
	await storage().put(photoKey, webp, 'image/webp');
	await db.itemType.update({ where: { id }, data: { photoKey } });
	if (type.photoKey) await storage().delete(type.photoKey);
	return photoKey;
}

export async function removeTypePhoto(actor: Actor, id: string): Promise<void> {
	const type = await findType(actor, id);
	if (!type.photoKey) return;
	await db.itemType.update({ where: { id }, data: { photoKey: null } });
	await storage().delete(type.photoKey);
}
