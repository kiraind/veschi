import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { idSchema } from '$lib/domain/id';
import { DEFAULT_STICKER_WIDTH, STICKER_WIDTHS } from '$lib/domain/sticker-sheet';
import { issueBatch, listBatches } from '$lib/server/services/stickers';

// 20 sheets of 10 mm stickers: 20 × 460.
const blankCount = z.number().int().min(0).max(9200).default(0);

const IssueBody = z.object({
	blanks: z
		.object({ 10: blankCount, 20: blankCount, 40: blankCount })
		.default({ 10: 0, 20: 0, 40: 0 }),
	orderItemIds: z.array(idSchema).max(2000).default([]),
	fill: z
		.literal([...STICKER_WIDTHS])
		.nullable()
		.default(DEFAULT_STICKER_WIDTH)
});

export const GET = apiHandler(async ({ actor }) => listBatches(actor));

export const POST = apiHandler(async ({ actor, request }) =>
	issueBatch(actor, await parseBody(request, IssueBody))
);
