import type { ParamMatcher } from '@sveltejs/kit';
import { normalizeCode } from '$lib/domain/sticker-code';

/** A sticker ID in the URL path: any case, dash optional (`/k7m4qx`, `/K7M-4QX`). */
export const match: ParamMatcher = (param) => normalizeCode(param) !== null;
