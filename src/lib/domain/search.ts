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
