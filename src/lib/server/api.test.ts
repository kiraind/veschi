import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { idSchema } from '$lib/domain/id';
import { errorResponse } from './api';

describe('errorResponse', () => {
	it('turns validation errors of zod/mini ($lib/domain) and of classic zod into 400', async () => {
		const mini = idSchema.safeParse('c a').error;
		const classic = z.object({ n: z.number() }).safeParse({ n: 'x' }).error;
		for (const e of [mini, classic]) {
			const res = errorResponse(e);
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error.code).toBe('validation');
			expect(body.error.message).toMatch(/[а-я]/);
		}
		expect((await errorResponse(mini).json()).error.message).toBe('Некорректный идентификатор');
	});
});
