import { z } from 'zod';
import { formatBarcode, normalizeBarcode, NOT_A_BARCODE } from '$lib/domain/barcode';
import { db, type Tx, writeTransaction } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { recordEvent, typeRef } from './history';

/**
 * Packaging barcodes of types («Штрихкоды»). A barcode identifies a product,
 * so it belongs to a type; a type can have several, a barcode belongs to one
 * type. The app never issues barcodes, it only remembers the ones it is shown.
 */

export const barcodeBodySchema = z.object({ code: z.string().trim().min(1).max(40) });

export type BarcodeResolution =
	| { status: 'known'; code: string; type: { id: string; name: string } }
	| { status: 'unknown'; code: string }
	| { status: 'invalid' };

/** Barcodes of a type in stored form, oldest first. */
export async function barcodesOf(typeId: string, tx: Tx = db): Promise<string[]> {
	const rows = await tx.typeBarcode.findMany({
		where: { typeId },
		select: { code: true },
		orderBy: { createdAt: 'asc' }
	});
	return rows.map((r) => r.code);
}

/** What a scanned or typed barcode is: the type it belongs to, a new barcode or no barcode. */
export async function resolveBarcode(actor: Actor, input: string): Promise<BarcodeResolution> {
	const code = normalizeBarcode(input);
	if (!code) return { status: 'invalid' };
	const found = await db.typeBarcode.findFirst({
		where: { code, ...visibleTo(actor) },
		select: { type: { select: { id: true, name: true } } }
	});
	return found ? { status: 'known', code, type: found.type } : { status: 'unknown', code };
}

/**
 * Links a barcode to a type. Linking it again to the same type changes
 * nothing; a barcode of another type is refused (unlink it there first).
 * Returns the stored form.
 */
export async function addBarcode(
	actor: Actor,
	typeId: string,
	input: string,
	tx?: Tx
): Promise<string> {
	if (!tx) return writeTransaction((t) => addBarcode(actor, typeId, input, t));
	const code = normalizeBarcode(input);
	if (!code) throw new ValidationError(NOT_A_BARCODE);
	const type = await tx.itemType.findFirst({ where: { id: typeId, ...visibleTo(actor) } });
	if (!type) throw new NotFoundError('Тип не найден');
	const existing = await tx.typeBarcode.findFirst({
		where: { code, ...visibleTo(actor) },
		include: { type: { select: { name: true } } }
	});
	if (existing?.typeId === typeId) return code;
	if (existing) {
		throw new ConflictError(
			`Штрихкод ${formatBarcode(code)} уже привязан к типу «${existing.type.name}»`
		);
	}
	await tx.typeBarcode.create({ data: { code, typeId, ...ownedBy(actor) } });
	await recordEvent(tx, actor, {
		kind: 'type.barcode',
		subject: typeRef(type),
		data: { code, removed: false }
	});
	return code;
}

/** Unlinks a barcode from a type; one it does not have is a 404. */
export async function removeBarcode(actor: Actor, typeId: string, input: string): Promise<void> {
	const code = normalizeBarcode(input);
	if (!code) throw new ValidationError(NOT_A_BARCODE);
	await writeTransaction(async (tx) => {
		const row = await tx.typeBarcode.findFirst({
			where: { code, typeId, ...visibleTo(actor) },
			include: { type: true }
		});
		if (!row) throw new NotFoundError('У типа нет такого штрихкода');
		await tx.typeBarcode.delete({ where: { id: row.id } });
		await recordEvent(tx, actor, {
			kind: 'type.barcode',
			subject: typeRef(row.type),
			data: { code, removed: true }
		});
	});
}
