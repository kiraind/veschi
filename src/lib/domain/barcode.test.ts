import { describe, expect, it } from 'vitest';
import {
	barcodeQuery,
	expandUpcE,
	formatBarcode,
	hasValidCheckDigit,
	normalizeBarcode
} from './barcode';

describe('hasValidCheckDigit', () => {
	it('accepts real codes of every length', () => {
		for (const code of ['4607001771531', '96385074', '036000291452', '10012345678902']) {
			expect(hasValidCheckDigit(code)).toBe(true);
		}
	});

	it('rejects a wrong check digit and non-digits', () => {
		for (const code of ['4607001771532', '96385075', '0360002914a2', '1234567']) {
			expect(hasValidCheckDigit(code)).toBe(false);
		}
	});
});

describe('expandUpcE', () => {
	it('expands each of the four patterns', () => {
		expect(expandUpcE('01234565')).toBe('012345000065');
		expect(expandUpcE('04252614')).toBe('042100005264');
		expect(expandUpcE('01234133')).toBe('012300000413');
		expect(expandUpcE('01234145')).toBe('012340000015');
	});

	it('rejects other number systems and wrong check digits', () => {
		expect(expandUpcE('21234565')).toBeNull();
		expect(expandUpcE('01234566')).toBeNull();
	});
});

describe('normalizeBarcode', () => {
	it('keeps EAN-13 and EAN-8, ignoring spaces and dashes', () => {
		expect(normalizeBarcode('4 607001 771531')).toBe('4607001771531');
		expect(normalizeBarcode('9638-5074')).toBe('96385074');
	});

	it('gives UPC-A, its EAN-13 and GTIN-14 one stored form', () => {
		for (const code of ['036000291452', '0036000291452', '00036000291452']) {
			expect(normalizeBarcode(code)).toBe('0036000291452');
		}
	});

	it('keeps a GTIN-14 of a carton', () => {
		expect(normalizeBarcode('10012345678902')).toBe('10012345678902');
	});

	it('expands UPC-E read by a scanner to the EAN-13 of its UPC-A', () => {
		expect(normalizeBarcode('01234565', { upcE: true })).toBe('0012345000065');
		// zxing reports UPC-E already expanded.
		expect(normalizeBarcode('0012345000065')).toBe('0012345000065');
	});

	it('reads typed 8 digits as UPC-E when they are no valid EAN-8', () => {
		expect(normalizeBarcode('04252614')).toBe('0042100005264');
	});

	it('rejects wrong check digits, lengths and letters', () => {
		for (const text of ['4607001771532', '1234567', '123456789', 'K7M4QX', '', '46070017715311']) {
			expect(normalizeBarcode(text)).toBeNull();
		}
	});
});

describe('barcodeQuery', () => {
	it('takes four or more digits', () => {
		expect(barcodeQuery('4607')).toBe('4607');
		expect(barcodeQuery('460')).toBeNull();
		expect(barcodeQuery('46a7')).toBeNull();
	});

	it('turns a full code into its stored form', () => {
		expect(barcodeQuery('036000291452')).toBe('0036000291452');
		expect(barcodeQuery('4 607001 771531')).toBe('4607001771531');
	});
});

describe('formatBarcode', () => {
	it('groups digits as printed', () => {
		expect(formatBarcode('4607001771531')).toBe('4 607001 771531');
		expect(formatBarcode('96385074')).toBe('9638 5074');
		expect(formatBarcode('10012345678902')).toBe('10012345678902');
	});
});
