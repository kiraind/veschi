import { db, type Tx } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { visibleTo, type Actor } from '$lib/server/scope';
import { formatCode, normalizeCode } from '$lib/domain/sticker-code';

/**
 * Binds a free sticker to an item that has no sticker yet. Used when creating
 * an item from a scanned sticker and when attaching a sticker to an existing item.
 */
export async function bindSticker(
	actor: Actor,
	codeInput: string,
	itemId: string,
	tx: Tx = db
): Promise<void> {
	const code = normalizeCode(codeInput);
	if (!code) throw new ValidationError('Некорректный ID наклейки');
	const sticker = await tx.sticker.findFirst({ where: { code, ...visibleTo(actor) } });
	if (!sticker) throw new NotFoundError('Такой наклейки нет');
	if (sticker.status !== 'FREE') {
		throw new ConflictError(`Наклейка ${formatCode(code)} уже использована`);
	}
	const existing = await tx.sticker.findUnique({ where: { itemId } });
	if (existing) throw new ConflictError('У вещи уже есть наклейка');
	await tx.sticker.update({ where: { id: sticker.id }, data: { status: 'BOUND', itemId } });
}
