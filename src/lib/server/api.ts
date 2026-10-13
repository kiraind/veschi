import { Prisma } from '@prisma/client';
import { error, json, type RequestEvent, type ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { AppError, UnauthorizedError, ValidationError } from './errors';
import type { Actor } from './scope';

// Russian messages for validation errors that have no custom message.
z.config(z.locales.ru());

export interface ApiErrorBody {
	error: { code: string; message: string; details?: unknown };
}

/**
 * Prisma errors that mean "no such record": a malformed id in the URL
 * (P2023, or 22P02 from raw SQL) or a missing record (P2025).
 */
function isNotFoundDbError(e: unknown): boolean {
	if (e instanceof Prisma.PrismaClientKnownRequestError) {
		return (
			e.code === 'P2023' ||
			e.code === 'P2025' ||
			(e.code === 'P2010' && (e.meta as { code?: string } | undefined)?.code === '22P02')
		);
	}
	return false;
}

/** Converts any thrown error into a JSON error response. */
export function errorResponse(e: unknown): Response {
	if (e instanceof AppError) {
		const body: ApiErrorBody = { error: { code: e.code, message: e.message, details: e.details } };
		return json(body, { status: e.status });
	}
	// The core class: errors of classic `zod` and of `zod/mini` ($lib/domain) alike.
	if (e instanceof z.core.$ZodError) {
		const body: ApiErrorBody = {
			error: {
				code: 'validation',
				message: e.issues[0]?.message ?? 'Некорректные данные',
				details: e.issues
			}
		};
		return json(body, { status: 400 });
	}
	if (isNotFoundDbError(e)) {
		const body: ApiErrorBody = { error: { code: 'not_found', message: 'Не найдено' } };
		return json(body, { status: 404 });
	}
	// A unique or foreign key the services did not foresee: a conflict, not a server failure.
	if (
		e instanceof Prisma.PrismaClientKnownRequestError &&
		(e.code === 'P2002' || e.code === 'P2003')
	) {
		const body: ApiErrorBody = {
			error: { code: 'conflict', message: 'Данные изменились, обновите страницу' }
		};
		return json(body, { status: 409 });
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

/**
 * Wraps a page `load`: requires a signed-in user and shows service errors on
 * the SvelteKit error page with their status (a deleted or mistyped id → 404),
 * not as a bare 500.
 *
 * @example
 * export const load: PageServerLoad = pageLoad(({ actor, params }) => getItemCard(actor, params.id));
 */
export function pageLoad<E extends ServerLoadEvent, R>(
	load: (event: E & { actor: Actor }) => Promise<R>
): (event: E) => Promise<R> {
	return async (event) => {
		const actor = actorOrError(event);
		try {
			return await load(Object.assign(event, { actor }));
		} catch (e) {
			if (e instanceof AppError) error(e.status, e.message);
			if (isNotFoundDbError(e)) error(404, 'Не найдено');
			throw e;
		}
	};
}

/** Same as requireActor, for `load` functions and form actions (SvelteKit error page). */
export function actorOrError(event: Pick<RequestEvent, 'locals'>): Actor {
	if (!event.locals.actor) error(401, 'Нужно войти');
	return event.locals.actor;
}

/** Parses and validates a JSON request body. */
export async function parseBody<S extends z.core.$ZodType>(
	request: Request,
	schema: S
): Promise<z.output<S>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw new ValidationError('Тело запроса должно быть JSON');
	}
	return z.parse(schema, raw);
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
