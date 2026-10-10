import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { issueBatch, listBatches } from '$lib/server/services/stickers';

const IssueBody = z.object({
	captions: z.array(z.string().max(200)).max(2000),
	blankCount: z.number().int().min(0).max(2000)
});

export const GET = apiHandler(async ({ actor }) => listBatches(actor));

export const POST = apiHandler(async ({ actor, request }) =>
	issueBatch(actor, await parseBody(request, IssueBody))
);
