/**
 * Feathered alpha mask at the quad boundary for smooth tile edges.
 *
 * Used by the overlay so the tile doesn't end in a hard line: alpha 255 inside the quad,
 * 0 outside, with a smooth transition over featherPx pixels (box blur on the binary mask).
 * Combine with occlusion mask and use destination-in when drawing the tile.
 */

import type { Quad } from "./tiledWall";

function cross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  q: { x: number; y: number }
): number {
  return (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
}

function insideQuad(quad: Quad, x: number, y: number): boolean {
  const [p0, p1, p2, p3] = quad;
  const q = { x, y };
  const c0 = cross(p0, p1, q);
  const c1 = cross(p1, p2, q);
  const c2 = cross(p2, p3, q);
  const c3 = cross(p3, p0, q);
  return (
    (c0 >= 0 && c1 >= 0 && c2 >= 0 && c3 >= 0) ||
    (c0 <= 0 && c1 <= 0 && c2 <= 0 && c3 <= 0)
  );
}

function blurAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  const tmp = new Uint8ClampedArray(width * height);
  const r = Math.max(1, radius);
  const size = (2 * r + 1) ** 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          const ny = Math.max(0, Math.min(height - 1, y + dy));
          sum += alpha[ny * width + nx];
        }
      }
      tmp[y * width + x] = Math.round(sum / size);
    }
  }
  alpha.set(tmp);
}

/**
 * Creates an ImageData mask: alpha 255 inside quad, 0 outside, smooth falloff over featherPx at the boundary.
 * Same size as overlay (width × height). Use with destination-in to soft-clip the tile.
 */
export function createFeatheredQuadMask(
  width: number,
  height: number,
  quad: Quad,
  featherPx: number = 5
): ImageData {
  const out = new ImageData(width, height);
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      alpha[y * width + x] = insideQuad(quad, x + 0.5, y + 0.5) ? 255 : 0;
    }
  }
  const radius = Math.max(1, Math.floor(featherPx / 2));
  blurAlpha(alpha, width, height, radius);
  for (let i = 0; i < width * height; i++) {
    out.data[i * 4] = 255;
    out.data[i * 4 + 1] = 255;
    out.data[i * 4 + 2] = 255;
    out.data[i * 4 + 3] = alpha[i];
  }
  return out;
}
