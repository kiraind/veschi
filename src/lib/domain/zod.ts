/**
 * Zod for `$lib/domain`. These schemas are imported by the browser too, so
 * they use `zod/mini` (the functional, tree-shakable API) instead of classic
 * `zod`; server-only schemas may use classic `zod`. Mini has no default
 * locale, so the Russian one is set here (the config is global and shared
 * with classic `zod` on the server).
 */
import * as z from 'zod/mini';

z.config(z.locales.ru());

export { z };
