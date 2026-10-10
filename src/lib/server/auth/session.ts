import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { hashPassword, verifyPassword } from './password';

export const SESSION_COOKIE = 'veschi_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions are extended when less than this much time is left. */
const RENEW_BEFORE_MS = 15 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = generateSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
	return { token, expiresAt };
}

export interface SessionUser {
	id: string;
	login: string;
	name: string;
	householdIds: string[];
}

/** Resolves a session token to its user; expired sessions are deleted. */
export async function validateSession(
	token: string
): Promise<{ sessionId: string; user: SessionUser; expiresAt: Date } | null> {
	const sessionId = hashToken(token);
	const session = await db.session.findUnique({
		where: { id: sessionId },
		include: { user: { include: { memberships: { select: { householdId: true } } } } }
	});
	if (!session) return null;
	if (session.expiresAt.getTime() <= Date.now()) {
		await db.session.delete({ where: { id: sessionId } }).catch(() => undefined);
		return null;
	}
	let expiresAt = session.expiresAt;
	if (expiresAt.getTime() - Date.now() < RENEW_BEFORE_MS) {
		expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		await db.session.update({ where: { id: sessionId }, data: { expiresAt } });
	}
	const { user } = session;
	return {
		sessionId,
		expiresAt,
		user: {
			id: user.id,
			login: user.login,
			name: user.name,
			householdIds: user.memberships.map((m) => m.householdId)
		}
	};
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await db.session.deleteMany({ where: { id: sessionId } });
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function deleteSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

// A real hash so a login attempt for an unknown user takes as long as a wrong password.
let dummyHash: Promise<string> | null = null;

/** Checks a login and password; returns the user id or null (one generic failure). */
export async function authenticate(login: string, password: string): Promise<string | null> {
	const user = await db.user.findUnique({ where: { login: login.trim() } });
	if (!user) {
		dummyHash ??= hashPassword('dummy-password');
		await verifyPassword(await dummyHash, password);
		return null;
	}
	return (await verifyPassword(user.passwordHash, password)) ? user.id : null;
}

/** Changes the password and signs out every other session of the user. */
export async function changePassword(
	userId: string,
	currentPassword: string,
	newPassword: string,
	keepSessionId?: string | null
): Promise<boolean> {
	const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
	if (!(await verifyPassword(user.passwordHash, currentPassword))) return false;
	const passwordHash = await hashPassword(newPassword);
	await db.$transaction([
		db.user.update({ where: { id: userId }, data: { passwordHash } }),
		db.session.deleteMany({
			where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) }
		})
	]);
	return true;
}
