import { db, type Tx, writeTransaction } from '$lib/server/db';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { ownedBy, visibleTo, type Actor } from '$lib/server/scope';
import { itemDisplayName } from '$lib/domain/item';
import { quantityError } from '$lib/domain/workbench';
import { isWorkbenchIconKey } from '$lib/domain/workbench-icons';
import { diffFields, type ChangeValue } from '$lib/domain/history';
import { discard } from './archive';
import { itemSubject, placeRef, recordEvent } from './history';
import {
	assertCanPlace,
	assertIsContainer,
	containerTypeInclude,
	getPath,
	getPaths,
	isContainerItem,
	type PathNode
} from './paths';
import { isPlainRecord, notTaken, partCount, placePart, sameThing } from './split';

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

export async function requireWorkbench(actor: Actor, id: string, tx: Tx = db): Promise<Workbench> {
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

/** Geofence as one comparable value for the history: «55.75, 37.61, 100 м». */
function geofence(b: Pick<Workbench, 'geoLat' | 'geoLng' | 'geoRadiusM'>): ChangeValue {
	return b.geoLat === null || b.geoLng === null || b.geoRadiusM === null
		? null
		: `${b.geoLat}, ${b.geoLng}, ${b.geoRadiusM} м`;
}

export async function createWorkbench(actor: Actor, input: WorkbenchInput): Promise<Workbench> {
	const data = workbenchData(input);
	return writeTransaction(async (tx) => {
		const bench = await tx.item.create({
			data: { ...ownedBy(actor), isWorkbench: true, ...data },
			select: workbenchSelect
		});
		await recordEvent(tx, actor, {
			kind: 'workbench.created',
			subject: await itemSubject(tx, bench.id),
			data: {}
		});
		return { ...bench, name: bench.name ?? '' };
	});
}

export async function updateWorkbench(
	actor: Actor,
	id: string,
	input: WorkbenchInput
): Promise<Workbench> {
	const data = workbenchData(input);
	return writeTransaction(async (tx) => {
		const old = await requireWorkbench(actor, id, tx);
		const bench = await tx.item.update({ where: { id }, data, select: workbenchSelect });
		const changes = diffFields(
			{ name: old.name, icon: old.icon, geofence: geofence(old) },
			{ name: data.name, icon: data.icon, geofence: geofence(data) }
		);
		if (changes.length) {
			await recordEvent(tx, actor, {
				kind: 'workbench.updated',
				subject: await itemSubject(tx, id),
				data: { changes }
			});
		}
		return { ...bench, name: bench.name ?? '' };
	});
}

/** Deletes an empty workbench; one with items on it is rejected. */
export async function deleteWorkbench(actor: Actor, id: string): Promise<void> {
	await writeTransaction(async (tx) => {
		await requireWorkbench(actor, id, tx);
		const onIt = await tx.item.count({ where: { parentId: id, status: 'ACTIVE' } });
		if (onIt > 0) throw new ConflictError('На столе есть вещи — сначала уберите их');
		await recordEvent(tx, actor, {
			kind: 'workbench.deleted',
			subject: await itemSubject(tx, id),
			data: {}
		});
		// A sticker bound to a bench by older versions is written off, not left bound to nothing.
		await tx.sticker.updateMany({
			where: { itemId: id },
			data: { status: 'WRITTEN_OFF', itemId: null }
		});
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
	return writeTransaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		const bench = await requireWorkbench(actor, workbenchId, tx);
		const count = partCount(item, quantity);
		const homeId = item.takenById ? item.homeId : item.parentId;
		const taken = { parentId: bench.id, takenById: actor.userId, takenAt: new Date(), homeId };
		const subject = await itemSubject(tx, item.id);
		const from = await placeRef(tx, item.parentId);
		const result = await placePart(tx, item, count, taken, { rememberSource: true });
		await tx.user.update({ where: { id: actor.userId }, data: { lastWorkbenchId: bench.id } });
		await recordEvent(tx, actor, {
			kind: 'item.taken',
			subject,
			data: {
				quantity: count,
				of: item.quantity,
				from,
				to: await placeRef(tx, bench.id),
				resultId: result
			}
		});
		return { itemId: result };
	});
}

export interface WorkbenchItem {
	id: string;
	name: string;
	quantity: number;
	/** The type's photo. */
	photoKey: string | null;
	isContainer: boolean;
	workbenchId: string;
	takenAt: Date | null;
	takenByName: string | null;
	hasChildren: boolean;
	/**
	 * Home container path including the home itself; empty = top level. Each container
	 * carries the code of its sticker, so «Вернуть» can say which box to look for.
	 */
	homePath: (PathNode & { stickerCode: string | null })[];
	canReturn: boolean;
	/** Why «Вернуть на место» is unavailable. */
	returnBlockedReason: string | null;
}

type HomeState = {
	id: string;
	status: string;
	takenById: string | null;
	isWorkbench: boolean;
	type: { isContainer: boolean } | null;
};

/** Why the item cannot go back to `home` (null = it can). */
function returnBlocker(home: HomeState | null, homePath: PathNode[]): string | null {
	if (!home) return null;
	if (home.status !== 'ACTIVE') return 'Исходное место в архиве';
	if (home.takenById || home.isWorkbench || homePath.some((n) => n.isWorkbench)) {
		return 'Исходное место само сейчас на рабочем столе';
	}
	if (!isContainerItem(home)) return 'Исходное место больше не контейнер';
	return null;
}

/**
 * Items on the actor's workbenches (or on one, or just one item), with where
 * each came from.
 */
export async function listWorkbench(
	actor: Actor,
	{ workbenchId, itemId }: { workbenchId?: string; itemId?: string } = {}
): Promise<WorkbenchItem[]> {
	const items = await db.item.findMany({
		where: {
			status: 'ACTIVE',
			isWorkbench: false,
			takenById: { not: null },
			...(workbenchId ? { parentId: workbenchId } : {}),
			...(itemId ? { id: itemId } : {}),
			...visibleTo(actor)
		},
		include: {
			type: { select: { name: true, photoKey: true, isContainer: true } },
			takenBy: { select: { name: true } },
			home: {
				select: {
					id: true,
					name: true,
					status: true,
					takenById: true,
					isWorkbench: true,
					type: { select: { name: true, isContainer: true } }
				}
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
		items.flatMap((i) =>
			i.home
				? [
						[
							i.home.id,
							{ id: i.home.id, name: itemDisplayName(i.home), isWorkbench: i.home.isWorkbench }
						]
					]
				: []
		)
	);
	const pathIds = [
		...new Set(
			[...homePaths.values()]
				.flat()
				.map((n) => n.id)
				.concat(homeIds)
		)
	];
	const stickerCodes = new Map(
		(
			await db.sticker.findMany({
				where: { itemId: { in: pathIds }, status: 'BOUND' },
				select: { itemId: true, code: true }
			})
		).map((s) => [s.itemId, s.code])
	);
	return items.map((i) => {
		const home = i.homeId ? homeNames.get(i.homeId) : undefined;
		const homePath = (home ? [...(homePaths.get(home.id) ?? []), home] : []).map((n) => ({
			...n,
			stickerCode: stickerCodes.get(n.id) ?? null
		}));
		const blocker = returnBlocker(i.home, homePath);
		return {
			id: i.id,
			name: itemDisplayName(i),
			quantity: i.quantity,
			photoKey: i.type?.photoKey ?? null,
			isContainer: i.type?.isContainer ?? false,
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
 * in the home, untaken, and both are still the same thing with nothing
 * pointing at them (same own name and own values; no sticker, contents or
 * references); otherwise it goes into the home through `placePart`, so it
 * may still join another identical record there. A part leaves the rest on the bench, still taken. Returns the id of
 * the record in the home.
 */
export async function returnHome(
	actor: Actor,
	itemId: string,
	{ quantity }: PartOptions = {}
): Promise<{ itemId: string; merged: boolean }> {
	return writeTransaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		if (!item.takenById) throw new ValidationError('Вещь не на рабочем столе');
		const count = partCount(item, quantity);
		const whole = count === item.quantity;
		const home = item.homeId
			? await tx.item.findFirst({
					where: { id: item.homeId, ...visibleTo(actor) },
					include: { type: { select: { isContainer: true } } }
				})
			: null;
		const blocker = returnBlocker(home, home ? await getPath(home.id, tx) : []);
		if (blocker) throw new ConflictError(`${blocker} — положите вещь в другое место`);
		const subject = await itemSubject(tx, item.id);
		const event = {
			quantity: count,
			of: item.quantity,
			from: await placeRef(tx, item.parentId),
			to: await placeRef(tx, item.homeId)
		};
		const returned = (resultId: string) =>
			recordEvent(tx, actor, { kind: 'item.returned', subject, data: { ...event, resultId } });

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
			// The same rules as for identical records in one place (see findTwin in split.ts):
			// still the same thing (a renamed part or one with other own values stays apart),
			// and neither record has a sticker, contents or references. A part is a fresh record.
			if (
				source &&
				(await sameThing(tx, item, source)) &&
				(await isPlainRecord(tx, source.id)) &&
				(!whole || (await isPlainRecord(tx, item.id)))
			) {
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
				await returned(source.id);
				return { itemId: source.id, merged: true };
			}
		}
		const id = await placePart(tx, item, count, { parentId: item.homeId, ...notTaken });
		await returned(id);
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
	return writeTransaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		const count = partCount(item, quantity);
		if (containerId === item.parentId && !item.takenById) {
			throw new ValidationError('Вещь уже лежит здесь');
		}
		if (containerId) {
			const container = await tx.item.findFirst({
				where: { id: containerId, ...visibleTo(actor) },
				include: containerTypeInclude
			});
			if (!container) throw new NotFoundError('Контейнер не найден');
			if (container.isWorkbench) {
				throw new ValidationError('Чтобы положить вещь на стол, используйте «На стол»');
			}
			if (container.status !== 'ACTIVE') throw new ValidationError('Контейнер в архиве');
			assertIsContainer(container);
			await assertCanPlace(item.id, container.id, tx);
		}
		const subject = await itemSubject(tx, item.id);
		const from = await placeRef(tx, item.parentId);
		const resultId = await placePart(tx, item, count, { parentId: containerId, ...notTaken });
		await recordEvent(tx, actor, {
			kind: 'item.moved',
			subject,
			data: {
				quantity: count,
				of: item.quantity,
				from,
				to: await placeRef(tx, containerId),
				resultId
			}
		});
		return { itemId: resultId };
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
	quantity: number,
	{ thrownAway = false }: { thrownAway?: boolean } = {}
): Promise<{ archived: boolean }> {
	return writeTransaction(async (tx) => {
		const item = await requireActiveItem(actor, itemId, tx);
		const problem = quantityError(item.quantity, quantity);
		if (problem) throw new ValidationError(problem);
		if (quantity === item.quantity) {
			const inside = await tx.item.count({ where: { parentId: item.id, status: 'ACTIVE' } });
			if (inside > 0) {
				// «Выкинуть» asks what to do with the contents; using a container up would not.
				throw new ValidationError('В контейнере есть вещи — выкиньте его и выберите, куда их деть');
			}
			await discard(actor, item.id, thrownAway ? {} : { consumed: true }, tx);
			return { archived: true };
		}
		await tx.item.update({ where: { id: item.id }, data: { quantity: item.quantity - quantity } });
		await recordEvent(tx, actor, {
			kind: 'item.consumed',
			subject: await itemSubject(tx, item.id),
			data: { quantity, left: item.quantity - quantity, ...(thrownAway ? { thrownAway } : {}) }
		});
		return { archived: false };
	});
}
