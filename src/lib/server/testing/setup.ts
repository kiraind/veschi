import { afterAll, beforeEach } from 'vitest';
import { db } from '$lib/server/db';
import { MemoryStorage, setStorage } from '$lib/server/storage';
import { resetDatabase } from './db';

// Integration tests run against the database in DATABASE_URL, which is wiped before each test.
if (!process.env.DATABASE_URL) {
	throw new Error('Integration tests need DATABASE_URL (see README, "Тесты")');
}

beforeEach(async () => {
	await resetDatabase();
	setStorage(new MemoryStorage());
});

afterAll(async () => {
	await db.$disconnect();
});
