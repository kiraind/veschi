import { z } from 'zod';

/** A record id: a cuid (`cmv2qfe3d…`, see docs/decisions.md «Четвёртая порция замечаний»). */
export const idSchema = z.cuid('Некорректный идентификатор');

/** An id from before the switch to cuid (UUID); old links with one are redirected. */
export const LEGACY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
