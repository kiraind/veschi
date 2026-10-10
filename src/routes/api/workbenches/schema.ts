import { z } from 'zod';

export const WorkbenchBody = z.object({
	name: z.string().min(1).max(200),
	geoLat: z.number().min(-90).max(90).nullable().optional(),
	geoLng: z.number().min(-180).max(180).nullable().optional(),
	geoRadiusM: z.number().positive().max(100_000).nullable().optional()
});
