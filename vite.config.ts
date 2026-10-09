import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.int.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					environment: 'node',
					include: ['src/**/*.int.test.ts'],
					setupFiles: ['src/lib/server/testing/setup.ts'],
					// Integration tests share one database, so files run one at a time.
					pool: 'forks',
					poolOptions: { forks: { singleFork: true } },
					testTimeout: 30_000,
					hookTimeout: 30_000
				}
			}
		]
	}
});
