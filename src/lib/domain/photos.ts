/** Ending of the object key of a photo without background (see src/lib/server/photos). */
export const CUTOUT_SUFFIX = '.cutout.webp';

/** A photo without background: shown with a shadow instead of on its own backdrop. */
export function isCutoutKey(key: string | null | undefined): boolean {
	return Boolean(key?.endsWith(CUTOUT_SUFFIX));
}

export type PhotoVersion = 'ORIGINAL' | 'CUTOUT';

/** The photo of a type and its processing, for the type page. */
export interface PhotoState {
	/** AUTO shows the cutout once it is ready. */
	choice: 'AUTO' | PhotoVersion;
	/** Versions ready to be shown. */
	available: PhotoVersion[];
	/** A step is queued or running. */
	processing: boolean;
	/** The last step failed for good. */
	failed: boolean;
	/** Processing is turned on (PHOTO_PROCESSING). */
	enabled: boolean;
}
