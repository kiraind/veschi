import { z } from 'zod';

/** A record id: a cuid (`cmv2qfe3d…`, see docs/decisions.md «Четвёртая порция замечаний»). */
export const idSchema = z.cuid('Некорректный идентификатор');
