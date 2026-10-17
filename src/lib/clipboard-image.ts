/**
 * Taking a photo from the clipboard (Ctrl/Cmd+V, the async Clipboard API) or from
 * files dropped onto the photo.
 */

const EXTENSIONS: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
	'image/heic': 'heic'
};

/** A clipboard image as a file; screenshots come without a name, so give them one. */
export function clipboardFile(blob: Blob, name?: string): File {
	if (blob instanceof File && blob.name) return blob;
	const ext = EXTENSIONS[blob.type] ?? 'png';
	return new File([blob], name || `clipboard.${ext}`, { type: blob.type || 'image/png' });
}

/** The first image of a paste or drop (`clipboardData` / `dataTransfer`), if any. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
	if (!data) return null;
	for (const file of Array.from(data.files ?? [])) {
		if (file.type.startsWith('image/')) return clipboardFile(file);
	}
	for (const item of Array.from(data.items ?? [])) {
		if (item.kind === 'file' && item.type.startsWith('image/')) {
			const file = item.getAsFile();
			if (file) return clipboardFile(file);
		}
	}
	return null;
}

/** Whether this browser can read images through `navigator.clipboard.read()`. */
export function canReadClipboardImages(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		typeof navigator.clipboard?.read === 'function' &&
		typeof ClipboardItem !== 'undefined'
	);
}

/** Whether a drag carries files (only then the photo invites a drop). */
export function dragHasFiles(data: DataTransfer | null): boolean {
	return !!data && Array.from(data.types ?? []).includes('Files');
}

export class ClipboardImageError extends Error {}

/** Reads the first image from the clipboard (asks for permission where the browser does). */
export async function readClipboardImage(
	clipboard: Pick<Clipboard, 'read'> = navigator.clipboard
): Promise<File> {
	let items: ClipboardItems;
	try {
		items = await clipboard.read();
	} catch {
		throw new ClipboardImageError('Нет доступа к буферу обмена');
	}
	for (const item of items) {
		const type = item.types.find((t) => t.startsWith('image/'));
		if (type) return clipboardFile(await item.getType(type));
	}
	throw new ClipboardImageError('В буфере обмена нет картинки');
}

/**
 * Whether a page-level paste should set the photo: not while a dialog (a sheet, the
 * camera, a confirmation) is open over the page.
 */
export function pasteTargetsPage(doc: Pick<Document, 'querySelector'> = document): boolean {
	return !doc.querySelector('dialog[open]');
}
