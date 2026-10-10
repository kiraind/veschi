export interface GeoPoint {
	lat: number;
	lng: number;
}

export interface WorkbenchZone {
	id: string;
	geoLat?: number | null;
	geoLng?: number | null;
	geoRadiusM?: number | null;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points in metres. */
export function haversineM(a: GeoPoint, b: GeoPoint): number {
	const rad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat);
	const dLng = rad(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function zoneOf(bench: WorkbenchZone): { centre: GeoPoint; radiusM: number } | null {
	if (bench.geoLat == null || bench.geoLng == null || bench.geoRadiusM == null) return null;
	return { centre: { lat: bench.geoLat, lng: bench.geoLng }, radiusM: bench.geoRadiusM };
}

/**
 * Workbench to take an item to (spec FR-14): the one whose zone contains the
 * position; among several zones the nearest centre; outside every zone (or
 * without a position) the last used one if it still exists, else the first.
 */
export function pickWorkbench(
	workbenches: WorkbenchZone[],
	position: GeoPoint | null,
	lastUsedId: string | null
): string | null {
	if (position) {
		let best: { id: string; distance: number } | null = null;
		for (const bench of workbenches) {
			const zone = zoneOf(bench);
			if (!zone) continue;
			const distance = haversineM(position, zone.centre);
			if (distance <= zone.radiusM && (!best || distance < best.distance)) {
				best = { id: bench.id, distance };
			}
		}
		if (best) return best.id;
	}
	if (lastUsedId && workbenches.some((b) => b.id === lastUsedId)) return lastUsedId;
	return workbenches[0]?.id ?? null;
}

/**
 * Validates how much of an item to take or use: whole numbers from 1 to the
 * available quantity. Returns an error message or null.
 */
export function quantityError(available: number, requested: number): string | null {
	if (!Number.isInteger(requested) || requested < 1) return 'Количество — целое число от 1';
	if (requested > available) return `Можно не больше ${available}`;
	return null;
}
