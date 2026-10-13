import { apiHandler } from '$lib/server/api';
import { removeBarcode } from '$lib/server/services/barcodes';
import type { RequestEvent } from './$types';

export const DELETE = apiHandler<RequestEvent>(async ({ actor, params }) => {
	await removeBarcode(actor, params.id, params.code);
});
