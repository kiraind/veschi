/**
 * Domain errors thrown by the service layer. API handlers turn them into JSON
 * responses with the matching HTTP status (see `$lib/server/api`).
 * Messages are user-facing and in Russian.
 */
export class AppError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: unknown
	) {
		super(message);
		this.name = 'AppError';
	}
}

export class NotFoundError extends AppError {
	constructor(message = 'Не найдено', details?: unknown) {
		super(404, 'not_found', message, details);
	}
}

export class ValidationError extends AppError {
	constructor(message: string, details?: unknown) {
		super(400, 'validation', message, details);
	}
}

export class ConflictError extends AppError {
	constructor(message: string, details?: unknown) {
		super(409, 'conflict', message, details);
	}
}

export class UnauthorizedError extends AppError {
	constructor(message = 'Нужно войти') {
		super(401, 'unauthorized', message);
	}
}

export class ForbiddenError extends AppError {
	constructor(message = 'Нет доступа') {
		super(403, 'forbidden', message);
	}
}
