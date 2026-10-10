import { db, type Tx } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { quantityError } from '$lib/domain/workbench';
import { isWorkbenchIconKey } from '$lib/domain/workbench-icons';
import { discard } from './archive';
import { assertCanPlace, assertIsContainer, getPath, getPaths, type PathNode } from './paths';
import { notTaken, partCount, placePart } from './split';

// ---------------------------------------------------------------------------
// Workbenches
// ---------------------------------------------------------------------------

export interface WorkbenchInput {
	name: string;
	/** Geofence: all three set, or none. */
	geoLat?: number | null;
	geoLng?: number | null;
	geoRadiusM?: number | null;
	/** A key from WORKBENCH_ICONS; null = the default icon, undefined = keep as is. */
	icon?: string | null;
}

export interface Workbench {
	id: string;
	name: string;
	geoLat: number | null;
	geoLng: number | null;
	geoRadiusM: number | null;
	icon: string | null;
}

const workbenchSelect = {
	id: true,
	name: true,
	geoLat: true,
	geoLng: true,
	geoRadiusM: true,
	icon: true
} as const;

function workbenchData(input: WorkbenchInput) {
	const name = input.name.trim();
	if (!name) throw new ValidationError('Укажите название стола');
	const { geoLat = null, geoLng = null, geoRadiusM = null } = input;
	const set = [geoLat, geoLng, geoRadiusM].filter((v) => v !== null).length;
	if (set !== 0 && set !== 3) throw new ValidationError('Для зоны нужны широта, долгота и радиус');
	if (geoLat !== null && (geoLat < -90 || geoLat > 90)) {
		throw new ValidationError('Широта — от −90 до 90');
	}
	if (geoLng !== null && (geoLng < -180 || geoLng > 180)) {
		throw new ValidationError('Долгота — от −180 до 180');
	}
	if (geoRadiusM !== null && !(geoRadiusM > 0)) {
		throw new ValidationError('Радиус должен быть больше нуля');
	}
	const { icon } = input;
	if (icon !== undefined && icon !== null && !isWorkbenchIconKey(icon)) {
		throw new ValidationError('Неизвестная иконка стола');
	}
	return { name, geoLat, geoLng, geoRadiusM, icon };
}

async function requireWorkbench(actor: Actor, id: string, tx: Tx = db): Promise<Workbench> {
	const bench = await tx.item.findFirst({
		where: { id, isWorkbench: true, ...visibleTo(actor) },
		select: workbenchSelect
	});
	if (!bench) throw new NotFoundError('Рабочий стол не найден');
	return { ...bench, name: bench.name ?? '' };
}

export async function listWorkbenches(
	actor: Actor
): Promise<{ workbenches: Workbench[]; lastWorkbenchId: string | null }> {
	const [benches, user] = await Promise.all([
		db.item.findMany({
			where: { isWorkbench: true, ...visibleTo(actor) },
			select: workbenchSelect,
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
		}),
		db.user.findUnique({ where: { id: actor.userId }, select: { lastWorkbenchId: true } })
	]);
	return {
		workbenches: benches.map((b) => ({ ...b, name: b.name ?? '' })),
		lastWorkbenchId: user?.lastWorkbenchId ?? null
	};
}

export async function createWorkbench(actor: Actor, input: WorkbenchInput): Promise<Workbench> {
	const bench = await db.item.create({
		data: { ...ownedBy(actor), isWorkbench: true, ...workbenchData(input) },
		select: workbenchSelect
	});
	return { ...bench, name: bench.name ?? '' };
}

export async function updateWorkbench(
	actor: Actor,
	id: string,
	input: WorkbenchInput
): Promise<Workbench> {
	await requireWorkbench(actor, id);
	const bench = await db.item.update({
		where: { id },
		data: workbenchData(input),
		select: workbenchSelect
	});
	return { ...bench, name: bench.name ?? '' };
}

/** Deletes an empty workbench; one with items on it is rejected. */
export async function deleteWorkbench(actor: Actor, id: string): Promise<void> {
	await db.$transaction(async (tx) => {
		await requireWorkbench(actor, id, tx);
		const onIt = await tx.item.count({ where: { parentId: id, status: 'ACTIVE' } });
		if (onIt > 0) throw new ConflictError('На столе есть вещи — сначала уберите их');
		// Archived items that lay on it lose their parent and are restored to the top level.
		await tx.item.delete({ where: { id } });
	});
}

// ---------------------------------------------------------------------------
// Items on workbenches
// ---------------------------------------------------------------------------

async function requireActiveItem(actor: Actor, id: string, tx: Tx) {
	const item = await tx.item.findFirst({
		where: { id, isWorkbench: false, ...visibleTo(actor) }
	});
	if (!item) throw new NotFoundError('Вещь не найдена');
	if (item.status !== 'ACTIVE') throw new ValidationError('Вещь в архиве');
	return item;
}

export interface TakeOptions {
	workbenchId: string;
	/** Part of the quantity; omitted or equal to the whole → the whole record. */
	quantity?: number;
}

/**
 * «На стол»: puts the item (with its contents) or part of its quantity on a
 * workbench, remembering where it came from. Taking part splits the record:
 * the source keeps the rest, its sticker and its own params; the part is a
 * new record with splitFromId. An item already on a bench keeps its home.
 * Returns the id of the record now on the bench.
 */
export async function take(
	actor: Actor,
	itemId: string,
	{ workbenchId, quantity }: TakeOptions
): Promise<{ itemId: string }> {
	return db.$transaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		const bench = await requireWorkbench(actor, workbenchId, tx);
		const count = partCount(item, quantity);
		const homeId = item.takenById ? item.homeId : item.parentId;
		const taken = { parentId: bench.id, takenById: actor.userId, takenAt: new Date(), homeId };
		const result = await placePart(tx, item, count, taken, { rememberSource: true });
		await tx.user.update({ where: { id: actor.userId }, data: { lastWorkbenchId: bench.id } });
		return { itemId: result };
	});
}

export interface WorkbenchItem {
	id: string;
	name: string;
	quantity: number;
	workbenchId: string;
	takenAt: Date | null;
	takenByName: string | null;
	hasChildren: boolean;
	/** Home container path including the home itself; empty = top level. */
	homePath: PathNode[];
	canReturn: boolean;
	/** Why «Вернуть на место» is unavailable. */
	returnBlockedReason: string | null;
}

type HomeState = {
	id: string;
	status: string;
	takenById: string | null;
	isWorkbench: boolean;
	isContainer: boolean;
};

/** Why the item cannot go back to `home` (null = it can). */
function returnBlocker(home: HomeState | null, homePath: PathNode[]): string | null {
	if (!home) return null;
	if (home.status !== 'ACTIVE') return 'Исходное место в архиве';
	if (home.takenById || home.isWorkbench || homePath.some((n) => n.isWorkbench)) {
		return 'Исходное место само сейчас на рабочем столе';
	}
	if (!home.isContainer) return 'Исходное место больше не контейнер';
	return null;
}

/** Items on the actor's workbenches (or on one), with where each came from. */
export async function listWorkbench(actor: Actor, workbenchId?: string): Promise<WorkbenchItem[]> {
	const items = await db.item.findMany({
		where: {
			status: 'ACTIVE',
			isWorkbench: false,
			takenById: { not: null },
			...(workbenchId ? { parentId: workbenchId } : {}),
			...visibleTo(actor)
		},
		include: {
			type: { select: { name: true } },
			takenBy: { select: { name: true } },
			home: {
				select: { id: true, status: true, takenById: true, isWorkbench: true, isContainer: true }
			},
			_count: { select: { children: { where: { status: 'ACTIVE' } } } }
		},
		orderBy: [{ takenAt: 'desc' }, { id: 'asc' }]
	});
	const homeIds = [...new Set(items.flatMap((i) => (i.homeId ? [i.homeId] : [])))];
	const [itemPaths, homePaths] = await Promise.all([
		getPaths(items.map((i) => i.id)),
		getPaths(homeIds)
	]);
	const homeNames = new Map(
		(
			await db.item.findMany({
				where: { id: { in: homeIds } },
				include: { type: { select: { name: true } } }
			})
		).map((h) => [h.id, { id: h.id, name: itemDisplayName(h), isWorkbench: h.isWorkbench }])
	);
	return items.map((i) => {
		const home = i.homeId ? homeNames.get(i.homeId) : undefined;
		const homePath = home ? [...(homePaths.get(home.id) ?? []), home] : [];
		const blocker = returnBlocker(i.home, homePath);
		return {
			id: i.id,
			name: itemDisplayName(i),
			quantity: i.quantity,
			workbenchId: itemPaths.get(i.id)?.[0]?.id ?? i.parentId ?? '',
			takenAt: i.takenAt,
			takenByName: i.takenBy?.name ?? null,
			hasChildren: i._count.children > 0,
			homePath,
			canReturn: blocker === null,
			returnBlockedReason: blocker
		};
	});
}

export interface PartOptions {
	/** Part of the quantity; omitted or equal to the whole → the whole record. */
	quantity?: number;
}

/**
 * «Вернуть на место» for the whole record or part of its quantity. What goes
 * back merges into its split source when the source is active and still lies
 * in the home, untaken (a whole record also must not have got a sticker or
 * contents of its own meanwhile); otherwise it lies in the home as its own
 * record. A part leaves the rest on the bench, still taken. Returns the id of
 * the record in the home.
 */
export async function returnHome(
	actor: Actor,
	itemId: string,
	{ quantity }: PartOptions = {}
): Promise<{ itemId: string; merged: boolean }> {
	return db.$transaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		if (!item.takenById) throw new ValidationError('Вещь не на рабочем столе');
		const count = partCount(item, quantity);
		const whole = count === item.quantity;
		const home = item.homeId
			? await tx.item.findFirst({ where: { id: item.homeId, ...visibleTo(actor) } })
			: null;
		const blocker = returnBlocker(home, home ? await getPath(home.id, tx) : []);
		if (blocker) throw new ConflictError(`${blocker} — положите вещь в другое место`);

		if (item.splitFromId) {
			const source = await tx.item.findFirst({
				where: {
					id: item.splitFromId,
					status: 'ACTIVE',
					parentId: item.homeId,
					takenById: null,
					...visibleTo(actor)
				}
			});
			// A part is a fresh record: it has no sticker or contents to lose.
			const [sticker, children] = whole
				? await Promise.all([
						tx.sticker.findUnique({ where: { itemId: item.id } }),
						tx.item.count({ where: { parentId: item.id } })
					])
				: [null, 0];
			if (source && !sticker && children === 0) {
				await tx.item.update({
					where: { id: source.id },
					data: { quantity: source.quantity + count }
				});
				if (whole) await tx.item.delete({ where: { id: item.id } });
				else {
					await tx.item.update({
						where: { id: item.id },
						data: { quantity: item.quantity - count }
					});
				}
				return { itemId: source.id, merged: true };
			}
		}
		const id = await placePart(tx, item, count, { parentId: item.homeId, ...notTaken });
		return { itemId: id, merged: false };
	});
}

/**
 * «Положить в другое место»: puts the item or part of its quantity into
 * another container (null = top level); what moves forgets where it was
 * taken from, a rest stays on the bench. Returns the id of the moved record.
 */
export async function relocate(
	actor: Actor,
	itemId: string,
	containerId: string | null,
	{ quantity }: PartOptions = {}
): Promise<{ itemId: string }> {
	return db.$transaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		const count = partCount(item, quantity);
		if (containerId) {
			const container = await tx.item.findFirst({
				where: { id: containerId, ...visibleTo(actor) },
				include: { type: { select: { name: true } } }
			});
			if (!container) throw new NotFoundError('Контейнер не найден');
			if (container.isWorkbench) {
				throw new ValidationError('Чтобы положить вещь на стол, используйте «На стол»');
			}
			if (container.status !== 'ACTIVE') throw new ValidationError('Контейнер в архиве');
			assertIsContainer(container);
			await assertCanPlace(item.id, container.id, tx);
		}
		return {
			itemId: await placePart(tx, item, count, { parentId: containerId, ...notTaken })
		};
	});
}

/**
 * «Использовать»: reduces the quantity. Using all of it archives the item
 * like «Выкинуть»; the archived record keeps its last quantity, so restoring
 * it brings back what was there.
 */
export async function consume(
	actor: Actor,
	itemId: string,
	quantity: number
): Promise<{ archived: boolean }> {
	return db.$transaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		const problem = quantityError(item.quantity, quantity);
		if (problem) throw new ValidationError(problem);
		if (quantity === item.quantity) {
			await discard(actor, item.id, {}, tx);
			return { archived: true };
		}
		await tx.item.update({ where: { id: item.id }, data: { quantity: item.quantity - quantity } });
		return { archived: false };
	});
}
