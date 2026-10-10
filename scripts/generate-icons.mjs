// Renders the PWA icons in static/icons from static/favicon.svg.
// Run after changing the favicon: `node scripts/generate-icons.mjs`.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const favicon = readFileSync('static/favicon.svg', 'utf8');
const background = /<rect width="64" height="64" rx="12"([^>]*)\/>/;
if (!background.test(favicon)) throw new Error('favicon.svg: background rect not found');

// Square corners: the platform applies its own mask (iOS, Android adaptive icons).
const fullBleed = favicon.replace(background, '<rect width="64" height="64"$1/>');
// Maskable icons are cropped to a circle of 80% of the size; shrink the glyph to fit it.
const maskable = fullBleed.replace(
	/(<rect width="64" height="64"[^>]*\/>)([\s\S]*)<\/svg>/,
	'$1<g transform="translate(32 32) scale(0.8) translate(-32 -32)">$2</g></svg>'
);

const icons = [
	{ file: 'icon-192.png', svg: favicon, size: 192 },
	{ file: 'icon-512.png', svg: favicon, size: 512 },
	{ file: 'maskable-512.png', svg: maskable, size: 512 },
	{ file: 'apple-touch-icon.png', svg: fullBleed, size: 180 }
];

for (const { file, svg, size } of icons) {
	// The SVG is 64 units wide; render at the target size without upscaling.
	await sharp(Buffer.from(svg), { density: (72 * size) / 64 })
		.resize(size, size)
		.png({ compressionLevel: 9 })
		.toFile(`static/icons/${file}`);
	console.log(`static/icons/${file}`);
}
