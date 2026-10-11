import type { GeoPoint } from '$lib/domain/workbench';

// The position is asked once per page load: a second prompt or wait would only annoy.
let positionRequest: Promise<GeoPoint | null> | null = null;

/** The device position for picking a workbench by its zone; null when unknown or denied. */
export function currentPosition(): Promise<GeoPoint | null> {
	positionRequest ??= new Promise((resolve) => {
		if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
		navigator.geolocation.getCurrentPosition(
			(p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
			() => resolve(null),
			{ timeout: 5000, maximumAge: 5 * 60_000 }
		);
	});
	return positionRequest;
}
