import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';
import { storage, type StoredObject } from '$lib/server/storage';
import { MAX_PARAM_FILE_SIZE, formatFileSize, type ParamValue } from '$lib/domain/params';

export type FileValue = Extract<ParamValue, { valueType: 'FILE' }>;

/**
 * Object keys: `params/<uploader id>/<uuid>` for parameter files,
 * `types/<type id>/<uuid>.webp` for type photos, `….source` for the upload
 * kept for processing and `<uuid>.cutout.webp` for a cutout (photos moved from items in
 * the round-2 migration keep their old `items/<item id>/…` keys). A photo
 * uploaded since round 4 also has a thumbnail at `thumbKeyOf(key)`; older
 * photos have none, and the full photo is served instead.
 */
function paramFilePrefix(actor: Actor): string {
	return `params/${actor.userId}/`;
}

/** True for a parameter file the actor uploaded (it may not be saved in a parameter yet). */
export function isOwnUpload(actor: Actor, key: string): boolean {
	return key.startsWith(paramFilePrefix(actor)) && !key.includes('..');
}

/** Where the thumbnail of a photo is stored. */
export function thumbKeyOf(photoKey: string): string {
	return `${photoKey.replace(/\.webp$/, '')}.thumb.webp`;
}

/** Deletes a stored file and, for a photo, its thumbnail. */
export async function deleteStored(key: string): Promise<void> {
	await storage().delete(key);
	await storage().delete(thumbKeyOf(key));
}

/** Reads the multipart field `file` of an upload request. */
export async function readUpload(
	request: Request
): Promise<{ name: string; type: string; data: Buffer }> {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		throw new ValidationError('Ожидалась загрузка файла (multipart/form-data)');
	}
	const file = form.get('file');
	if (!(file instanceof File)) throw new ValidationError('Файл не выбран');
	return { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) };
}

/** Stores an uploaded file for a FILE parameter and returns the value to save. */
export async function uploadParamFile(
	actor: Actor,
	file: { name: string; type: string; data: Buffer }
): Promise<FileValue> {
	if (file.data.length === 0) throw new ValidationError('Файл пустой');
	if (file.data.length > MAX_PARAM_FILE_SIZE) {
		throw new ValidationError(`Файл больше ${formatFileSize(MAX_PARAM_FILE_SIZE)}`);
	}
	const fileMime = file.type || 'application/octet-stream';
	const fileKey = paramFilePrefix(actor) + randomUUID();
	await storage().put(fileKey, file.data, fileMime);
	return {
		valueType: 'FILE',
		fileKey,
		fileName: file.name.trim().slice(0, 255) || 'файл',
		fileMime,
		fileSize: file.data.length
	};
}

/**
 * Opens a stored file for the actor: a photo of a visible type, a file of a
 * visible type/item parameter, or the actor's own fresh upload.
 */
export async function openFile(
	actor: Actor,
	key: string,
	{ thumb = false }: { thumb?: boolean } = {}
): Promise<StoredObject & { fileName: string | null }> {
	// The access check and the download run at the same time; the file is sent only
	// once the check allows it, and its stream is dropped otherwise.
	const [access, download] = await Promise.allSettled([
		fileAccess(actor, key),
		// Access is checked on the photo itself; a photo without a thumbnail is served whole.
		(async () => (thumb ? await storage().get(thumbKeyOf(key)) : null) ?? storage().get(key))()
	]);
	const object = download.status === 'fulfilled' ? download.value : null;
	if (access.status === 'rejected' || !access.value.allowed) {
		object?.body.destroy();
		// A key the actor may not open is «not found», whatever the storage said about it.
		if (access.status === 'rejected') throw access.reason;
		throw new NotFoundError('Файл не найден');
	}
	if (download.status === 'rejected') throw download.reason;
	if (!object) throw new NotFoundError('Файл не найден');
	return { ...object, fileName: access.value.fileName };
}

/** Whether the actor may open the file, and its original name (file parameters). */
async function fileAccess(
	actor: Actor,
	key: string
): Promise<{ allowed: boolean; fileName: string | null }> {
	if (isOwnUpload(actor, key)) {
		const param = await db.param.findFirst({ where: { fileKey: key } });
		return { allowed: true, fileName: param?.fileName ?? null };
	}
	const [type, param] = await Promise.all([
		db.itemType.findFirst({
			where: {
				OR: [{ photoKey: key }, { photoOriginalKey: key }, { photoCutoutKey: key }],
				...visibleTo(actor)
			}
		}),
		db.param.findFirst({
			where: { fileKey: key, OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }] }
		})
	]);
	return { allowed: Boolean(type || param), fileName: param?.fileName ?? null };
}

/** Deletes stored objects that no parameter or type photo references any more. */
export async function deleteUnreferencedFiles(keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	const [params, types] = await Promise.all([
		db.param.findMany({ where: { fileKey: { in: keys } }, select: { fileKey: true } }),
		db.itemType.findMany({
			where: {
				OR: [
					{ photoKey: { in: keys } },
					{ photoSourceKey: { in: keys } },
					{ photoOriginalKey: { in: keys } },
					{ photoCutoutKey: { in: keys } }
				]
			},
			select: { photoKey: true, photoSourceKey: true, photoOriginalKey: true, photoCutoutKey: true }
		})
	]);
	const used = new Set([
		...params.map((p) => p.fileKey),
		...types.flatMap((t) => [t.photoKey, t.photoSourceKey, t.photoOriginalKey, t.photoCutoutKey])
	]);
	for (const key of keys) {
		if (!used.has(key)) await deleteStored(key);
	}
}
