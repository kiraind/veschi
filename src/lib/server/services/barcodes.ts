import { z } from 'zod';
import { formatBarcode, normalizeBarcode, NOT_A_BARCODE } from '$lib/domain/barcode';
import { db, type Tx, writeTransaction } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';
import { recordEvent, typeRef } from './history';

/**
 * Packaging barcodes of types («Штрихкод»). A barcode identifies a product,
 * so it belongs to a type: one per type, and a barcode belongs to one type of
 * its owner. The app never issues barcodes, it only remembers the ones it is shown.
 */

export const barcodeBodySchema = z.object({ code: z.string().trim().min(1).max(40) });

export type BarcodeResolution =
	| { status: 'known'; code: string; type: { id: string; name: string } }
	| { status: 'unknown'; code: string }
	| { status: 'invalid' };

/** What a scanned or typed barcode is: the type it belongs to, a new barcode or no barcode. */
export async function resolveBarcode(actor: Actor, input: string): Promise<BarcodeResolution> {
	const code = normalizeBarcode(input);
	if (!code) return { status: 'invalid' };
	const type = await db.itemType.findFirst({
		where: { barcode: code, ...visibleTo(actor) },
		select: { id: true, name: true }
	});
	return type ? { status: 'known', code, type } : { status: 'unknown', code };
}

/**
 * Sets the barcode of a type. A barcode of another type is refused (unlink it
 * there first). A type that has another barcode keeps it unless `replace`
 * (changing it on the type card); setting the same one changes nothing.
 * Returns the stored form.
 */
export async function setBarcode(
	actor: Actor,
	typeId: string,
	input: string,
	{ replace = false }: { replace?: boolean } = {},
	tx?: Tx
): Promise<string> {
	if (!tx) return writeTransaction((t) => setBarcode(actor, typeId, input, { replace }, t));
	const code = normalizeBarcode(input);
	if (!code) throw new ValidationError(NOT_A_BARCODE);
	const type = await tx.itemType.findFirst({ where: { id: typeId, ...visibleTo(actor) } });
	if (!type) throw new NotFoundError('Тип не найден');
	if (type.barcode === code) return code;
	const other = await tx.itemType.findFirst({
		where: { barcode: code, ...visibleTo(actor) },
		select: { name: true }
	});
	if (other) {
		throw new ConflictError(`Штрихкод ${formatBarcode(code)} уже привязан к типу «${other.name}»`);
	}
	if (type.barcode && !replace) {
		throw new ConflictError(
			`У типа «${type.name}» уже есть штрихкод ${formatBarcode(type.barcode)} — замените его на странице типа`
		);
	}
	await tx.itemType.update({ where: { id: typeId }, data: { barcode: code } });
	await recordEvent(tx, actor, {
		kind: 'type.barcode',
		subject: typeRef(type),
		data: { code, removed: false, ...(type.barcode ? { previous: type.barcode } : {}) }
	});
	return code;
}

/** Unlinks the barcode of a type; a type without one is left as it is. */
export async function removeBarcode(actor: Actor, typeId: string): Promise<void> {
	await writeTransaction(async (tx) => {
		const type = await tx.itemType.findFirst({ where: { id: typeId, ...visibleTo(actor) } });
		if (!type) throw new NotFoundError('Тип не найден');
		if (!type.barcode) return;
		await tx.itemType.update({ where: { id: typeId }, data: { barcode: null } });
		await recordEvent(tx, actor, {
			kind: 'type.barcode',
			subject: typeRef(type),
			data: { code: type.barcode, removed: true }
		});
	});
}
