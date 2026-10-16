// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Actor } from '$lib/server/scope';

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			user: { id: string; login: string; name: string } | null;
			/** Ownership scope of the signed-in user; null when signed out. */
			actor: Actor | null;
			sessionId: string | null;
		}
		// interface PageData {}
		interface PageState {
			/** The tab this history entry was opened in (`$lib/tabs.svelte`). */
			tab?: string | null;
		}
		// interface Platform {}
	}
}

export {};
