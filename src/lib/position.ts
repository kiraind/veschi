import type { GeoPoint } from '$lib/domain/workbench';

/** How long to wait for a position: the permission prompt does not count towards `timeout`. */
const WAIT_MS = 5000;
/** A known position is reused for a while, then asked again (the user may have moved). */
const FRESH_MS = 2 * 60_000;

let known: { point: GeoPoint; at: number } | null = null;
let pending: Promise<GeoPoint | null> | null = null;

/** The device position for picking a workbench by its zone; null when unknown, denied or slow. */
export function currentPosition(): Promise<GeoPoint | null> {
	if (known && Date.now() - known.at < FRESH_MS) return Promise.resolve(known.point);
	pending ??= new Promise<GeoPoint | null>((resolve) => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
		const timer = setTimeout(() => resolve(null), WAIT_MS);
		navigator.geolocation.getCurrentPosition(
			(p) => {
				clearTimeout(timer);
				known = { point: { lat: p.coords.latitude, lng: p.coords.longitude }, at: Date.now() };
				resolve(known.point);
			},
			() => {
				clearTimeout(timer);
				resolve(null);
			},
			{ timeout: WAIT_MS, maximumAge: FRESH_MS }
		);
	}).finally(() => (pending = null));
	return pending;
}
