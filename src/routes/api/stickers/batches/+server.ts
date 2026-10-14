import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { idSchema } from '$lib/domain/id';
import { DEFAULT_STICKER_WIDTH, STICKER_WIDTHS } from '$lib/domain/sticker-sheet';
import { issueBatch, listBatches } from '$lib/server/services/stickers';

const width = z.literal([...STICKER_WIDTHS]);
const blankCount = z.number().int().min(0).max(2000).default(0);

const IssueBody = z.object({
	captions: z.array(z.string().max(200)).max(2000),
	captionWidth: width.default(DEFAULT_STICKER_WIDTH),
	blanks: z.object({ 20: blankCount, 40: blankCount }).default({ 20: 0, 40: 0 }),
	orderItemIds: z.array(idSchema).max(2000).default([]),
	fillSheet: z.boolean().default(true)
});

export const GET = apiHandler(async ({ actor }) => listBatches(actor));

export const POST = apiHandler(async ({ actor, request }) =>
	issueBatch(actor, await parseBody(request, IssueBody))
);
