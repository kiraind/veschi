import { apiHandler, parseBody } from '$lib/server/api';
import { barcodeBodySchema, removeBarcode, setBarcode } from '$lib/server/services/barcodes';
import type { RequestEvent } from './$types';

/** Links a packaging barcode to the type, replacing its own: `{ code }` → `{ code }` (stored form). */
export const PUT = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { code } = await parseBody(request, barcodeBodySchema);
	return { code: await setBarcode(actor, params.id, code, { replace: true }) };
});

/** Without `replace`: refused when the type has another barcode (the «Новый штрихкод» page). */
export const POST = apiHandler<RequestEvent>(async ({ actor, params, request }) => {
	const { code } = await parseBody(request, barcodeBodySchema);
	return { code: await setBarcode(actor, params.id, code) };
});

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await removeBarcode(actor, params.id);
});
