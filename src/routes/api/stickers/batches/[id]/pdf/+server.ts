import { apiHandler } from '$lib/server/api';
import { getBatchPdf } from '$lib/server/services/stickers';
import type { RequestEvent } from './$types';

export const GET = apiHandler<RequestEvent>(async ({ actor, params }) => {
	const { filename, pdf } = await getBatchPdf(actor, params.id);
	return new Response(new Uint8Array(pdf), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `inline; filename="${filename}"`,
			'cache-control': 'private, no-store'
		}
	});
});
