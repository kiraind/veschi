/**
 * The centered square of a `width` × `height` frame, as the camera preview shows it
 * (`object-cover`): source rectangle `sx, sy, side` and the output size `size`
 * (no larger than `maxSide`, never upscaled).
 */
export function centerSquare(
	width: number,
	height: number,
	maxSide: number
): { sx: number; sy: number; side: number; size: number } {
	const side = Math.min(width, height);
	return {
		sx: Math.round((width - side) / 2),
		sy: Math.round((height - side) / 2),
		side,
		size: Math.min(side, maxSide)
	};
}
