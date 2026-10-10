/**
 * Ownership scope. Every catalog record is personal (ownerId) or shared
 * (householdId). Services receive an Actor and must filter every query with
 * `visibleTo(actor)` and create records with `ownedBy(actor)`, so permission
 * checks happen on the server in each request (spec: "права проверяются на
 * сервере в каждом запросе").
 */
export interface Actor {
	userId: string;
	/** Households the user belongs to. Always empty in the MVP. */
	householdIds: string[];
}

/** Prisma `where` fragment matching records the actor may see and change. */
export function visibleTo(actor: Actor) {
	return actor.householdIds.length === 0
		? { ownerId: actor.userId }
		: { OR: [{ ownerId: actor.userId }, { householdId: { in: actor.householdIds } }] };
}

/** Ownership columns for a record the actor creates (personal in the MVP). */
export function ownedBy(actor: Actor): { ownerId: string; householdId: null } {
	return { ownerId: actor.userId, householdId: null };
}
