/** A search query: free text, plus a key/value pair when written as «ключ: значение». */
export interface SearchQuery {
	text: string;
	param: { key: string; value: string } | null;
}

/** Parses the search box input. «корпус: DIP-8» also yields param {корпус, DIP-8}. */
export function parseSearchQuery(input: string): SearchQuery {
	const text = input.trim().replace(/\s+/g, ' ');
	const match = /^([^:]+):(.+)$/.exec(text);
	const key = match?.[1]?.trim();
	const value = match?.[2]?.trim();
	// "https://…" is a URL, not a key "https".
	const param = key && value && !value.startsWith('//') ? { key, value } : null;
	return { text, param };
}

/** Escapes LIKE wildcards so the input is matched literally as a substring. */
export function likePattern(s: string): string {
	return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Longest example that still fits the search field on a phone. */
const MAX_EXAMPLE_LENGTH = 20;

/** Examples for a user who has nothing yet. */
const DEFAULT_NAME = 'NE555';
const DEFAULT_PARAM = { key: 'корпус', value: 'DIP-8' };

/**
 * The search field placeholder: nothing but examples, a name and a «ключ: значение», taken from
 * the user's own types and parameters when there are short enough ones.
 */
export function searchPlaceholder(
	names: string[],
	params: { key: string; value: string }[],
	random: () => number = Math.random
): string {
	const pick = <T>(list: T[]): T | undefined => list[Math.floor(random() * list.length)];
	const name = pick(names.filter((n) => n.length <= MAX_EXAMPLE_LENGTH)) ?? DEFAULT_NAME;
	const param =
		pick(
			params.filter(
				(p) => !p.key.includes(':') && `${p.key}: ${p.value}`.length <= MAX_EXAMPLE_LENGTH
			)
		) ?? DEFAULT_PARAM;
	return `${name} или «${param.key}: ${param.value}»`;
}
