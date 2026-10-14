import { redirect } from '@sveltejs/kit';
import { pageLoad } from '$lib/server/api';
import { resolveBarcode } from '$lib/server/services/barcodes';
import type { PageServerLoad } from './$types';

/** A scanned packaging barcode: open its type, or offer to link it to a type. */
export const load: PageServerLoad = pageLoad(async (event) => {
	const result = await resolveBarcode(event.actor, event.params.code);
	if (result.status === 'known') redirect(303, `/types/${result.type.id}`);
	return { result, input: event.params.code };
});
