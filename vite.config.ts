import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rollupOptions: {
			treeshake: {
				// flowbite-svelte does not declare `sideEffects`, and its components import each
				// other through the package index, so every component and theme of the library
				// ended up in the bundle. Its JS modules have no side effects; its CSS does.
				moduleSideEffects: (id) => !/\/node_modules\/flowbite-svelte\/.*\.(js|svelte)$/.test(id)
			}
		}
	},
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
