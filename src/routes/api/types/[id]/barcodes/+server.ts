import { apiHandler, parseBody } from '$lib/server/api';
import { addBarcode, barcodeBodySchema } from '$lib/server/services/barcodes';
import type { RequestEvent } from './$types';

/** Links a packaging barcode to the type: `{ code }` → `{ code }` (stored form). */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { code } = await parseBody(request, barcodeBodySchema);
	return { code: await addBarcode(actor, params.id, code) };
});
