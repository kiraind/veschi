import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';
import { storage, type StoredObject } from '$lib/server/storage';
import { MAX_PARAM_FILE_SIZE, formatFileSize, type ParamValue } from '$lib/domain/params';

export type FileValue = Extract<ParamValue, { valueType: 'FILE' }>;

/**
 * Object keys: `params/<uploader id>/<uuid>` for parameter files,
 * `types/<type id>/<uuid>.webp` for type photos, `items/<item id>/<uuid>.<ext>` for item photos.
 */
function paramFilePrefix(actor: Actor): string {
	return `params/${actor.userId}/`;
}

/** True for a parameter file the actor uploaded (it may not be saved in a parameter yet). */
export function isOwnUpload(actor: Actor, key: string): boolean {
	return key.startsWith(paramFilePrefix(actor)) && !key.includes('..');
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
 * Opens a stored file for the actor: a photo of a visible type or item, a file of a
 * visible type/item parameter, or the actor's own fresh upload.
 */
export async function openFile(
	actor: Actor,
	key: string
): Promise<StoredObject & { fileName: string | null }> {
	let fileName: string | null = null;
	let allowed = isOwnUpload(actor, key);
	if (!allowed) {
		const [type, item, param] = await Promise.all([
			db.itemType.findFirst({ where: { photoKey: key, ...visibleTo(actor) } }),
			db.item.findFirst({ where: { photoKey: key, ...visibleTo(actor) } }),
			db.param.findFirst({
				where: { fileKey: key, OR: [{ type: visibleTo(actor) }, { item: visibleTo(actor) }] }
			})
		]);
		allowed = Boolean(type || item || param);
		fileName = param?.fileName ?? null;
	} else {
		const param = await db.param.findFirst({ where: { fileKey: key } });
		fileName = param?.fileName ?? null;
	}
	const object = allowed ? await storage().get(key) : null;
	if (!object) throw new NotFoundError('Файл не найден');
	return { ...object, fileName };
}

/** Deletes stored objects that no parameter or type photo references any more. */
export async function deleteUnreferencedFiles(keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	const [params, types] = await Promise.all([
		db.param.findMany({ where: { fileKey: { in: keys } }, select: { fileKey: true } }),
		db.itemType.findMany({ where: { photoKey: { in: keys } }, select: { photoKey: true } })
	]);
	const used = new Set([...params.map((p) => p.fileKey), ...types.map((t) => t.photoKey)]);
	for (const key of keys) {
		if (!used.has(key)) await storage().delete(key);
	}
}
