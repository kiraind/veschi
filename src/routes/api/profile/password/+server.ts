import { z } from 'zod';
import { apiHandler, parseBody } from '$lib/server/api';
import { changePassword } from '$lib/server/auth/session';
import { ValidationError } from '$lib/server/errors';
import type { RequestHandler } from './$types';

const MIN_PASSWORD_LENGTH = 8;

const schema = z.object({
	currentPassword: z.string().min(1, 'Введите текущий пароль'),
	newPassword: z
		.string()
		.min(MIN_PASSWORD_LENGTH, `Новый пароль — не короче ${MIN_PASSWORD_LENGTH} символов`)
		.max(256, 'Слишком длинный пароль')
});

/** Changes the signed-in user's password; the current one must be confirmed. */
export const POST: RequestHandler = apiHandler(async ({ actor, request, locals }) => {
	const { currentPassword, newPassword } = await parseBody(request, schema);
	if (!(await changePassword(actor.userId, currentPassword, newPassword, locals.sessionId))) {
		throw new ValidationError('Неверный текущий пароль');
	}
});
