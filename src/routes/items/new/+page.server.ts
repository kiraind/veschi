import { pageLoad } from '$lib/server/api';
import { getItemSummary } from '$lib/server/services/items';
import { resolveBarcode } from '$lib/server/services/barcodes';
import { resolveCode } from '$lib/server/services/stickers';
import { getType } from '$lib/server/services/types';
import { listWorkbenches } from '$lib/server/services/workbench';
import type { PageServerLoad } from './$types';

/**
 * Pre-filled form: `?sticker=<code>` (the caption becomes the name),
 * `?parent=<id>` (the container), `?type=<id>` (the type), `?barcode=<digits>`
 * (a packaging barcode: its type, or linked to the type of the new item). Without a container
 * the item goes on a workbench (picked as for «На стол»), if there is one.
 */
export const load: PageServerLoad = pageLoad(async (event) => {
	const { actor } = event;
	const stickerInput = event.url.searchParams.get('sticker');
	const parentId = event.url.searchParams.get('parent');
	const barcodeInput = event.url.searchParams.get('barcode');
	const barcode = barcodeInput ? await resolveBarcode(actor, barcodeInput) : null;
	const typeId = barcode?.status === 'known' ? barcode.type.id : event.url.searchParams.get('type');
	const [sticker, parent, type, benches] = await Promise.all([
		stickerInput ? resolveCode(actor, stickerInput) : null,
		parentId ? getItemSummary(actor, parentId).catch(() => null) : null,
		typeId ? getType(actor, typeId).catch(() => null) : null,
		listWorkbenches(actor)
	]);
	return {
		sticker,
		barcode: barcode?.status === 'unknown' ? barcode.code : null,
		type,
		workbenches: benches.workbenches,
		lastWorkbenchId: benches.lastWorkbenchId,
		parent
	};
});
