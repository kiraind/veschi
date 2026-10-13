/**
 * Product barcodes printed on packaging: EAN-13, EAN-8, UPC-A, UPC-E and
 * GTIN-14 (the GS1 family). The app never issues them, it only links the ones
 * that are already there to types.
 *
 * Stored form: digits only, the check digit included. One product has one
 * stored form however it was read: UPC-A and GTIN-14 with a leading zero
 * become the EAN-13 they are equal to, UPC-E is expanded to its UPC-A first.
 * EAN-8 stays 8 digits.
 */

export const NOT_A_BARCODE =
	'Это не штрихкод товара: нужны 8, 12, 13 или 14 цифр с верной контрольной цифрой';

/** True when the last digit is the GS1 check digit of the others. */
export function hasValidCheckDigit(digits: string): boolean {
	if (!/^\d{8,14}$/.test(digits)) return false;
	let sum = 0;
	for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
		sum += Number(digits[i]) * weight;
	}
	return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/** UPC-E (8 digits: number system 0/1, 6 digits, check digit) → UPC-A, or null. */
export function expandUpcE(code: string): string | null {
	if (!/^[01]\d{7}$/.test(code)) return null;
	const [s, d1, d2, d3, d4, d5, d6, check] = [...code] as string[];
	let body: string;
	if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
	else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
	else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
	else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
	const upcA = `${s}${body}${check}`;
	return hasValidCheckDigit(upcA) ? upcA : null;
}

/**
 * Typed or scanned barcode → stored form, or null when it is not a product
 * barcode. Spaces and dashes are ignored. 8 digits are EAN-8 when the check
 * digit fits, otherwise UPC-E; `upcE` says a scanner read it as UPC-E.
 */
export function normalizeBarcode(input: string, { upcE = false } = {}): string | null {
	const digits = input.replace(/[\s-]/g, '');
	if (!/^\d+$/.test(digits)) return null;
	if (digits.length === 8) {
		const upcA = expandUpcE(digits);
		if (upcE || !hasValidCheckDigit(digits)) return upcA ? `0${upcA}` : null;
		return digits;
	}
	if (![12, 13, 14].includes(digits.length) || !hasValidCheckDigit(digits)) return null;
	const gtin13 = digits.padStart(14, '0').replace(/^0/, '');
	return gtin13.length === 13 ? gtin13 : digits;
}

/** Shortest run of digits search looks up among barcodes (shorter ones match too much). */
const MIN_BARCODE_PART = 4;

/**
 * Digits of a query that may be (part of) a barcode, as search compares them
 * with the stored form, or null. A full UPC-A also matches its EAN-13.
 */
export function barcodeQuery(input: string): string | null {
	const digits = input.replace(/[\s-]/g, '');
	if (!/^\d+$/.test(digits) || digits.length < MIN_BARCODE_PART || digits.length > 14) return null;
	return normalizeBarcode(digits) ?? digits;
}

/** Stored form → display form: digits grouped as printed under the bars. */
export function formatBarcode(code: string): string {
	if (code.length === 13) return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`;
	if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
	return code;
}
