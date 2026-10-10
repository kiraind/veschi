import { actorOrError } from '$lib/server/api';
import { getItemCard } from '$lib/server/services/items';
import { resolveCode } from '$lib/server/services/stickers';
import { getType } from '$lib/server/services/types';
import type { PageServerLoad } from './$types';

/**
 * Pre-filled form: `?sticker=<code>` (the caption becomes the name),
 * `?parent=<id>` (the container), `?type=<id>` (the type).
 */
export const load: PageServerLoad = async (event) => {
	const actor = actorOrError(event);
	const stickerInput = event.url.searchParams.get('sticker');
	const parentId = event.url.searchParams.get('parent');
	const typeId = event.url.searchParams.get('type');
	const [sticker, parent, type] = await Promise.all([
		stickerInput ? resolveCode(actor, stickerInput) : null,
		parentId ? getItemCard(actor, parentId).catch(() => null) : null,
		typeId ? getType(actor, typeId).catch(() => null) : null
	]);
	return {
		sticker,
		type,
		parent: parent && { id: parent.item.id, name: parent.item.displayName, path: parent.path }
	};
};
