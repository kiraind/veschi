import { z } from 'zod';
import { db } from '$lib/server/db';
import type { Actor } from '$lib/server/scope';

export const profileInputSchema = z.object({
	name: z.string().trim().min(1, 'Введите имя').max(100, 'Имя — не длиннее 100 символов')
});

/** Changes the signed-in user's display name (shown in the header and «достал(а)»). */
export async function updateProfile(actor: Actor, input: unknown): Promise<{ name: string }> {
	const { name } = profileInputSchema.parse(input);
	await db.user.update({ where: { id: actor.userId }, data: { name } });
	return { name };
}
