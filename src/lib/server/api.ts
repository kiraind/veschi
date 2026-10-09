import { error, json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { AppError, UnauthorizedError, ValidationError } from './errors';
import type { Actor } from './scope';

export interface ApiErrorBody {
	error: { code: string; message: string; details?: unknown };
}

/** Converts any thrown error into a JSON error response. */
export function errorResponse(e: unknown): Response {
	if (e instanceof AppError) {
		const body: ApiErrorBody = { error: { code: e.code, message: e.message, details: e.details } };
		return json(body, { status: e.status });
	}
	if (e instanceof z.ZodError) {
		const body: ApiErrorBody = {
			error: { code: 'validation', message: 'Некорректные данные', details: e.issues }
		};
		return json(body, { status: 400 });
	}
	console.error(e);
	const body: ApiErrorBody = { error: { code: 'internal', message: 'Внутренняя ошибка сервера' } };
	return json(body, { status: 500 });
}

/** The signed-in actor, or a 401 error. */
export function requireActor(event: Pick<RequestEvent, 'locals'>): Actor {
	if (!event.locals.actor) throw new UnauthorizedError();
	return event.locals.actor;
}

/** Same as requireActor, for `load` functions and form actions (SvelteKit error page). */
export function actorOrError(event: Pick<RequestEvent, 'locals'>): Actor {
	if (!event.locals.actor) error(401, 'Нужно войти');
	return event.locals.actor;
}

/** Parses and validates a JSON request body. */
export async function parseBody<S extends z.ZodType>(
	request: Request,
	schema: S
): Promise<z.infer<S>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw new ValidationError('Тело запроса должно быть JSON');
	}
	return schema.parse(raw);
}

/**
 * Wraps a JSON API handler: requires a signed-in user and maps errors to JSON.
 * The handler returns plain data (serialized with `json`) or a Response.
 *
 * @example
 * export const GET = apiHandler(async ({ actor, params }) => getItem(actor, params.id));
 */
export function apiHandler<E extends RequestEvent>(
	handler: (event: E & { actor: Actor }) => Promise<unknown> | unknown
): (event: E) => Promise<Response> {
	return async (event) => {
		try {
			const actor = requireActor(event);
			const result = await handler(Object.assign(event, { actor }));
			if (result instanceof Response) return result;
			if (result === undefined) return new Response(null, { status: 204 });
			return json(result);
		} catch (e) {
			return errorResponse(e);
		}
	};
}
