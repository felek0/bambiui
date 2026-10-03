/*
 * bambiui logo artwork (576 x 560 units). Single source for the header mark
 * (icons.tsx), app/icon.svg and the generated app icons and social images.
 */

// bambiui mark: head silhouette, face (inner curve closed along the head edge) and eye.
export const brand = {
  head: "M0 490.342V100.342C0 45.342 7 8.342 30 1.342C65-9.358 148 45.342 189 115.342C219 111.342 253 109.342 287.5 109.342C322 109.342 356 111.342 386 115.342C427 45.342 510-9.358 545 1.342C568 8.342 575 45.342 575 100.342V490.342C575 533.342 548 559.342 505 559.342H70C27 559.342 0 533.342 0 490.342Z",
  faceCurve:
    "M0 355.842C3.996 322.842 110.517 372.342 169.451 389.342C219.895 397.842 244.867 395.842 259.851 334.842C273.835 278.842 199.418 208.342 246.366 137.842C263 118.842 290.317 116.994 310.794 137.842C340.261 167.842 356.743 228.842 394.701 266.842C432.658 304.842 575 381.605 575 410.842",
  face: "M246.366 137.842C263 118.842 290.317 116.994 310.794 137.842C340.261 167.842 356.743 228.842 394.701 266.842C432.658 304.842 575 381.605 575 410.842C575 425.842 575.624 453.347 575 489.842C574 548.342 532.5 559.342 502.581 559.342C502.581 559.342 127 560.342 70 559.342C13 558.342 0 518.842 0 490.342C0 461.842 0 355.842 0 355.842C3.996 322.842 110.517 372.342 169.451 389.342C219.895 397.842 244.867 395.842 259.851 334.842C273.835 278.842 199.418 208.342 246.366 137.842Z",
  eye: "M392.5 425.842A20 20 0 1 0 392.5 385.842A20 20 0 1 0 392.5 425.842Z",
};

export const brandColor = "#e8673c";

/**
 * Standalone SVG markup of the mark: the outline plus the filled upper head
 * (head minus face, via evenodd) and eye. `strokeWidth` is in artwork units.
 */
export function brandSvg({
  color = brandColor,
  strokeWidth = 22,
}: { color?: string; strokeWidth?: number } = {}) {
  const pad = strokeWidth;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${576 + pad * 2} ${560 + pad * 2}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="${brand.head} ${brand.face} ${brand.eye}" fill="${color}" fill-rule="evenodd" stroke="none"/>`,
    ...[brand.head, brand.faceCurve, brand.eye].map((d) => `<path d="${d}"/>`),
    "</svg>",
  ].join("");
}

export const brandSvgDataUri = (options?: Parameters<typeof brandSvg>[0]) =>
  `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(brandSvg(options)), byte => String.fromCharCode(byte)).join(""))}`;
