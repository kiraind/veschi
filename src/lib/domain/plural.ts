/**
 * Russian plural form for a count: `plural(n, ['штука', 'штуки', 'штук'])` —
 * 1 штука, 2 штуки, 5 штук, 11 штук, 21 штука.
 */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
	const abs = Math.abs(Math.trunc(n));
	const tens = abs % 100;
	const units = abs % 10;
	if (tens >= 11 && tens <= 14) return many;
	if (units === 1) return one;
	if (units >= 2 && units <= 4) return few;
	return many;
}

/** A quantity written out, as Russian text shows it: «1 штука», «3 штуки», «10 штук». */
export function pieces(n: number): string {
	return `${n} ${plural(n, ['штука', 'штуки', 'штук'])}`;
}

/** The same in the accusative, after «использовать», «положите», «на … меньше»: «1 штуку», «3 штуки», «10 штук». */
export function piecesAccusative(n: number): string {
	return `${n} ${plural(n, ['штуку', 'штуки', 'штук'])}`;
}

/** The same in the genitive, after «из»: «из 1 штуки», «из 3 штук», «из 21 штуки». */
export function piecesGenitive(n: number): string {
	return `${n} ${plural(n, ['штуки', 'штук', 'штук'])}`;
}
