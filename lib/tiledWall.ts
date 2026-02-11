/**
 * 2D canvas-based tile visualizer: tiled pattern with createPattern(), then perspective warp to quad.
 *
 * Pipeline (renderTiledWall):
 * 1. Fill offscreen canvas with repeating tile pattern (createPattern + scale to match tile count).
 * 2. Optional: multiply by lighting map (darkens tile where room is darker; requires wall-only map).
 * 3. Optional: overlay subtle monochrome noise to break repetition.
 * 4. Warp offscreen result to the destination quad (drawQuadWarp).
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface SizeMM {
  width: number;
  height: number;
}

/** Wall bounding box in pixels (e.g. from quad bounds). */
export interface WallBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Quad: 4 corners in order [top-left, top-right, bottom-right, bottom-left]. */
export type Quad = [Point2D, Point2D, Point2D, Point2D];

/**
 * Get axis-aligned bounding box from a quad.
 */
export function quadToBBox(quad: Quad): WallBBox {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  return { x, y, width, height };
}

/** Subdivisions for projective homography warp (smoother perspective, tiles converge to vanishing point). */
const HOMOGRAPHY_SUBDIV = 32;

/**
 * Compute 3x3 homography H mapping source rect (0,0)-(srcW,srcH) to dest quad.
 * (x,y,w)' = H*(s,t,1)', screen = (x/w, y/w). Returns H as 3x3 row-major [0..8].
 */
function homographyFromQuad(
  destQuad: Quad,
  srcW: number,
  srcH: number
): number[] {
  const [p0, p1, p2, p3] = destQuad;
  const src = [[0, 0], [srcW, 0], [srcW, srcH], [0, srcH]];
  const dst = [[p0.x, p0.y], [p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y]];
  const A: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i][0], t = src[i][1], x = dst[i][0], y = dst[i][1];
    A.push(-s, -t, -1, 0, 0, 0, x * s, x * t); b.push(-x);
    A.push(0, 0, 0, -s, -t, -1, y * s, y * t); b.push(-y);
  }
  const n = 8;
  const M = Array(n * (n + 1));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) M[r * (n + 1) + c] = A[r * n + c];
    M[r * (n + 1) + n] = b[r];
  }
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r * (n + 1) + col]) > Math.abs(M[pivot * (n + 1) + col])) pivot = r;
    for (let c = 0; c <= n; c++) {
      const t = M[col * (n + 1) + c]; M[col * (n + 1) + c] = M[pivot * (n + 1) + c]; M[pivot * (n + 1) + c] = t;
    }
    const div = M[col * (n + 1) + col];
    if (Math.abs(div) < 1e-12) continue;
    for (let c = 0; c <= n; c++) M[col * (n + 1) + c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r * (n + 1) + col];
      for (let c = 0; c <= n; c++) M[r * (n + 1) + c] -= f * M[col * (n + 1) + c];
    }
  }
  return [
    M[0 * (n + 1) + n], M[1 * (n + 1) + n], M[2 * (n + 1) + n],
    M[3 * (n + 1) + n], M[4 * (n + 1) + n], M[5 * (n + 1) + n],
    M[6 * (n + 1) + n], M[7 * (n + 1) + n], 1
  ];
}

function homographyMap(H: number[], s: number, t: number): { x: number; y: number } {
  const w = H[6] * s + H[7] * t + H[8];
  if (Math.abs(w) < 1e-9) return { x: 0, y: 0 };
  return {
    x: (H[0] * s + H[1] * t + H[2]) / w,
    y: (H[3] * s + H[4] * t + H[5]) / w,
  };
}

function drawTriangleWarp(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  dx0: number, dy0: number, dx1: number, dy1: number, dx2: number, dy2: number,
  sx0: number, sy0: number, sx1: number, sy1: number, sx2: number, sy2: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0); ctx.lineTo(dx1, dy1); ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();
  const denom = (sx1 - sx0) * (sy2 - sy0) - (sy1 - sy0) * (sx2 - sx0);
  if (Math.abs(denom) < 1e-10) { ctx.restore(); return; }
  const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / denom;
  const b = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / denom;
  const c = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / denom;
  const d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / denom;
  const e = dx0 - a * sx0 - b * sy0;
  const f = dy0 - c * sx0 - d * sy0;
  ctx.setTransform(a, c, b, d, e, f);
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  ctx.restore();
}

/**
 * Draw source rectangle onto ctx warped to the destination quad using projective homography.
 * Subdivides into a grid so tiles converge to a vanishing point.
 */
function drawQuadWarp(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement | HTMLImageElement,
  destQuad: Quad,
  sourceWidth: number,
  sourceHeight: number
): void {
  const H = homographyFromQuad(destQuad, sourceWidth, sourceHeight);
  const n = HOMOGRAPHY_SUBDIV;
  const stepX = sourceWidth / n;
  const stepY = sourceHeight / n;
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const s0 = ix * stepX, t0 = iy * stepY, s1 = (ix + 1) * stepX, t1 = (iy + 1) * stepY;
      const d00 = homographyMap(H, s0, t0), d10 = homographyMap(H, s1, t0), d11 = homographyMap(H, s1, t1), d01 = homographyMap(H, s0, t1);
      drawTriangleWarp(ctx, source, sourceWidth, sourceHeight, d00.x, d00.y, d10.x, d10.y, d11.x, d11.y, s0, t0, s1, t0, s1, t1);
      drawTriangleWarp(ctx, source, sourceWidth, sourceHeight, d00.x, d00.y, d11.x, d11.y, d01.x, d01.y, s0, t0, s1, t1, s0, t1);
    }
  }
}

/** Options for renderTiledWall: lighting, noise, and optional grout. All applied before the final warp. */
export interface RenderTiledWallOptions {
  /** Lighting map canvas (size = wall bbox). Applied with multiply blend so tile follows room lighting. */
  lightingCanvas?: HTMLCanvasElement | null;
  /** Strength of lighting multiply (default 1). Values > 1 apply a second multiply pass for stronger falloff (e.g. floor). */
  lightingStrength?: number;
  /** Monochrome noise opacity 0–1 (e.g. 0.015 = 1.5%) to break tile repetition; 0 = off. */
  noiseOpacity?: number;
  /** Draw grout lines at tile boundaries for perceived depth. 0 = off; ~0.4 = subtle. */
  groutOpacity?: number;
}

/**
 * Renders a repeating tile pattern that fills the wall area, then draws it warped to the quad.
 *
 * - Tiles fit: wallWidthMM / tileWidthMM (horizontal), wallHeightMM / tileHeightMM (vertical); no rounding.
 * - Tile aspect ratio is preserved (one pattern cell = one tile image).
 * - Partial tiles at edges are allowed (no rounding of tile counts).
 * - Uses createPattern() for repetition; perspective warp is applied after tiling.
 *
 * @param ctx - Canvas 2D context to draw into
 * @param wallQuad - 4 corners of the wall in pixels [top-left, top-right, bottom-right, bottom-left]
 * @param tileImage - Tile image (will be used with createPattern; aspect preserved)
 * @param tileSizeMM - Real-world tile size in mm
 * @param wallSizeMM - Real-world wall size in mm
 * @param options - Optional micro noise
 */
export function renderTiledWall(
  ctx: CanvasRenderingContext2D,
  wallQuad: Quad,
  tileImage: HTMLImageElement,
  tileSizeMM: SizeMM,
  wallSizeMM: SizeMM,
  options?: RenderTiledWallOptions
): void {
  const bbox = quadToBBox(wallQuad);
  const wallWidthPx = bbox.width;
  const wallHeightPx = bbox.height;

  if (wallWidthPx <= 0 || wallHeightPx <= 0 || tileSizeMM.width <= 0 || tileSizeMM.height <= 0 ||
      wallSizeMM.width <= 0 || wallSizeMM.height <= 0) return;

  const imgW = tileImage.naturalWidth;
  const imgH = tileImage.naturalHeight;
  if (imgW <= 0 || imgH <= 0) return;

  // How many tiles fit (float – partial tiles at edges allowed)
  const tilesX = wallSizeMM.width / tileSizeMM.width;
  const tilesY = wallSizeMM.height / tileSizeMM.height;

  // Offscreen canvas: same pixel size as wall bbox; we'll fill it with the tiled pattern
  const off = document.createElement("canvas");
  off.width = wallWidthPx;
  off.height = wallHeightPx;
  const offCtx = off.getContext("2d");
  if (!offCtx) return;

  // Scale so one pattern repetition in offscreen pixels = (wallWidthPx/tilesX, wallHeightPx/tilesY).
  // Pattern repeats every (imgW, imgH) in pattern space; we want that to be (wallWidthPx/tilesX, wallHeightPx/tilesY) in offscreen pixels.
  // So scaleX = (wallWidthPx/tilesX)/imgW would give repeat every (wallWidthPx/tilesX, wallHeightPx/tilesY). But createPattern repeats in the transform we set: after scale(sx,sy), one repeat = (imgW*sx, imgH*sy). So we need imgW*sx = wallWidthPx/tilesX, imgH*sy = wallHeightPx/tilesY => sx = wallWidthPx/(tilesX*imgW), sy = wallHeightPx/(tilesY*imgH).
  const scaleX = wallWidthPx / (tilesX * imgW);
  const scaleY = wallHeightPx / (tilesY * imgH);

  const pattern = offCtx.createPattern(tileImage, "repeat");
  if (!pattern) return;

  // In scaled space we need to fill enough so that in canvas pixels we cover (0,0)-(wallWidthPx, wallHeightPx).
  // fillRect(x,y,w,h) with scale(sx,sy) draws in canvas pixels (0,0)-(w*sx, h*sy), so use w = wallWidthPx/scaleX, h = wallHeightPx/scaleY.
  offCtx.save();
  offCtx.scale(scaleX, scaleY);
  offCtx.fillStyle = pattern;
  offCtx.fillRect(0, 0, wallWidthPx / scaleX, wallHeightPx / scaleY);
  offCtx.restore();

  // --- Grout lines: thin dark lines at tile boundaries for perceived depth (bump effect) ---
  const groutOpacity = options?.groutOpacity ?? 0.3;
  if (groutOpacity > 0 && tilesX > 0 && tilesY > 0) {
    const stepPxX = wallWidthPx / tilesX;
    const stepPxY = wallHeightPx / tilesY;
    offCtx.save();
    offCtx.strokeStyle = `rgba(50,50,50,${Math.min(1, groutOpacity)})`;
    offCtx.lineWidth = 1;
    for (let i = 1; i < Math.ceil(tilesX); i++) {
      const x = i * stepPxX;
      offCtx.beginPath();
      offCtx.moveTo(x, 0);
      offCtx.lineTo(x, wallHeightPx);
      offCtx.stroke();
    }
    for (let j = 1; j < Math.ceil(tilesY); j++) {
      const y = j * stepPxY;
      offCtx.beginPath();
      offCtx.moveTo(0, y);
      offCtx.lineTo(wallWidthPx, y);
      offCtx.stroke();
    }
    offCtx.restore();
  }

  // --- Lighting: multiply by lighting map so contact shadows anchor furniture on the tiles ---
  const lightingCanvas = options?.lightingCanvas;
  const lightingStrength = Math.max(1, options?.lightingStrength ?? 1);
  if (lightingCanvas && lightingCanvas.width === wallWidthPx && lightingCanvas.height === wallHeightPx) {
    offCtx.globalCompositeOperation = "multiply";
    offCtx.drawImage(lightingCanvas, 0, 0, wallWidthPx, wallHeightPx);
    // Optional second multiply pass for stronger falloff (e.g. floor receding into room)
    if (lightingStrength > 1) {
      const extra = Math.min(1, lightingStrength - 1);
      offCtx.globalAlpha = extra;
      offCtx.drawImage(lightingCanvas, 0, 0, wallWidthPx, wallHeightPx);
      offCtx.globalAlpha = 1;
    }
    offCtx.globalCompositeOperation = "source-over";
  }

  // --- Micro noise: overlay subtle random gray so tiles look like physical objects ---
  const noiseOpacity = options?.noiseOpacity ?? 0.02;
  if (noiseOpacity > 0) {
    const noise = document.createElement("canvas");
    noise.width = wallWidthPx;
    noise.height = wallHeightPx;
    const nCtx = noise.getContext("2d");
    if (nCtx) {
      const id = nCtx.createImageData(wallWidthPx, wallHeightPx);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.floor(256 * Math.random());
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      nCtx.putImageData(id, 0, 0);
      offCtx.globalAlpha = noiseOpacity;
      offCtx.globalCompositeOperation = "overlay";
      offCtx.drawImage(noise, 0, 0);
      offCtx.globalAlpha = 1;
      offCtx.globalCompositeOperation = "source-over";
    }
  }

  // Perspective warp: draw the tiled offscreen canvas onto the destination quad
  drawQuadWarp(ctx, off, wallQuad, wallWidthPx, wallHeightPx);
}
