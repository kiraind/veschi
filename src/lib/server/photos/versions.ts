import { randomUUID } from 'node:crypto';
import type { ItemType, PhotoChoice } from '@prisma/client';
import { CUTOUT_SUFFIX } from '$lib/domain/photos';

type PhotoFields = Pick<
	ItemType,
	'photoKey' | 'photoSourceKey' | 'photoOriginalKey' | 'photoCutoutKey' | 'photoChoice'
>;

/** The key shown for a choice: the cutout when it is chosen (or AUTO) and ready, else the original. */
export function shownKey(
	type: Pick<ItemType, 'photoOriginalKey' | 'photoCutoutKey'>,
	choice: PhotoChoice
): string | null {
	if (choice !== 'ORIGINAL' && type.photoCutoutKey) return type.photoCutoutKey;
	return type.photoOriginalKey;
}

/** The picture processing starts from: the upload as it came, or the original of an old photo. */
export function sourceOf(
	type: Pick<ItemType, 'photoSourceKey' | 'photoOriginalKey'>
): string | null {
	return type.photoSourceKey ?? type.photoOriginalKey;
}

/** Every stored object of a type photo (each may also have a thumbnail). */
export function photoKeysOf(type: PhotoFields): string[] {
	const keys = [type.photoKey, type.photoSourceKey, type.photoOriginalKey, type.photoCutoutKey];
	return [...new Set(keys.filter((k): k is string => Boolean(k)))];
}

/** Object keys of a new upload of a type photo. */
export function newPhotoKeys(typeId: string): { source: string; original: string } {
	const base = `types/${typeId}/${randomUUID()}`;
	return { source: `${base}.source`, original: `${base}.webp` };
}

/** Object key of a new cutout (new each time: stored files are cached by their key). */
export function newCutoutKey(typeId: string): string {
	return `types/${typeId}/${randomUUID()}${CUTOUT_SUFFIX}`;
}
