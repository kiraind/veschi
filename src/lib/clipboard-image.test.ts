import { describe, expect, it } from 'vitest';
import {
	clipboardFile,
	ClipboardImageError,
	imageFromPaste,
	pasteTargetsPage,
	readClipboardImage
} from './clipboard-image';

function transfer(files: File[], items: DataTransferItem[] = []): DataTransfer {
	return { files, items } as unknown as DataTransfer;
}

function fileItem(file: File): DataTransferItem {
	return { kind: 'file', type: file.type, getAsFile: () => file } as unknown as DataTransferItem;
}

function clipboardItem(blobs: Record<string, Blob>): ClipboardItem {
	return {
		types: Object.keys(blobs),
		getType: async (type: string) => blobs[type]
	} as unknown as ClipboardItem;
}

describe('clipboardFile', () => {
	it('names an unnamed screenshot by its type', () => {
		const file = clipboardFile(new Blob(['x'], { type: 'image/jpeg' }));
		expect(file.name).toBe('clipboard.jpg');
		expect(file.type).toBe('image/jpeg');
	});

	it('keeps a named file as is', () => {
		const original = new File(['x'], 'mug.webp', { type: 'image/webp' });
		expect(clipboardFile(original)).toBe(original);
	});
});

describe('imageFromPaste', () => {
	it('takes the first image file', () => {
		const text = new File(['hi'], 'a.txt', { type: 'text/plain' });
		const image = new File(['x'], 'a.png', { type: 'image/png' });
		expect(imageFromPaste(transfer([text, image]))).toBe(image);
	});

	it('falls back to file items', () => {
		const image = new File(['x'], '', { type: 'image/png' });
		const file = imageFromPaste(transfer([], [fileItem(image)]));
		expect(file?.name).toBe('clipboard.png');
	});

	it('ignores pasted text', () => {
		const item = { kind: 'string', type: 'text/plain' } as DataTransferItem;
		expect(imageFromPaste(transfer([], [item]))).toBeNull();
		expect(imageFromPaste(null)).toBeNull();
	});
});

describe('readClipboardImage', () => {
	it('reads the first image of the clipboard', async () => {
		const png = new Blob(['x'], { type: 'image/png' });
		const clipboard = {
			read: async () => [
				clipboardItem({ 'text/plain': new Blob(['hi']) }),
				clipboardItem({ 'text/html': new Blob(['<img>']), 'image/png': png })
			]
		};
		const file = await readClipboardImage(clipboard);
		expect(file.name).toBe('clipboard.png');
		expect(file.size).toBe(1);
	});

	it('says when there is no image', async () => {
		const clipboard = { read: async () => [clipboardItem({ 'text/plain': new Blob(['hi']) })] };
		await expect(readClipboardImage(clipboard)).rejects.toThrow('В буфере обмена нет картинки');
	});

	it('says when access is denied', async () => {
		const clipboard = {
			read: async () => {
				throw new DOMException('denied', 'NotAllowedError');
			}
		};
		const error = await readClipboardImage(clipboard).catch((e) => e);
		expect(error).toBeInstanceOf(ClipboardImageError);
		expect(error.message).toBe('Нет доступа к буферу обмена');
	});
});

describe('pasteTargetsPage', () => {
	it('is off while a dialog is open', () => {
		expect(pasteTargetsPage({ querySelector: () => null } as never)).toBe(true);
		expect(pasteTargetsPage({ querySelector: () => ({}) } as never)).toBe(false);
	});
});
