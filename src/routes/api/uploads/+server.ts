import { apiHandler } from '$lib/server/api';
import { readUpload, uploadParamFile } from '$lib/server/services/files';

/** Multipart field `file` → the FILE parameter value to put into a parameter list. */
export const POST = apiHandler(async ({ actor, request }) =>
	uploadParamFile(actor, await readUpload(request))
);
