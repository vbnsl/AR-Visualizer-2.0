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

/**
 * Draw a source rectangle (image or canvas) onto ctx warped to the destination quad.
 * Uses two triangles with affine mapping for perspective-like warp.
 */
function drawQuadWarp(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement | HTMLImageElement,
  destQuad: Quad,
  sourceWidth: number,
  sourceHeight: number
): void {
  const [p0, p1, p2, p3] = destQuad;
  const drawTriangle = (
    dx0: number,
    dy0: number,
    dx1: number,
    dy1: number,
    dx2: number,
    dy2: number,
    sx0: number,
    sy0: number,
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dx0, dy0);
    ctx.lineTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.clip();
    const denom = (sx1 - sx0) * (sy2 - sy0) - (sy1 - sy0) * (sx2 - sx0);
    if (Math.abs(denom) < 1e-10) {
      ctx.restore();
      return;
    }
    const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / denom;
    const b = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / denom;
    const c = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / denom;
    const d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / denom;
    const e = dx0 - a * sx0 - b * sy0;
    const f = dy0 - c * sx0 - d * sy0;
    ctx.setTransform(a, c, b, d, e, f);
    ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    ctx.restore();
  };
  drawTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, 0, 0, sourceWidth, 0, sourceWidth, sourceHeight);
  drawTriangle(p0.x, p0.y, p2.x, p2.y, p3.x, p3.y, 0, 0, sourceWidth, sourceHeight, 0, sourceHeight);
}

/** Options for renderTiledWall: lighting, noise, and optional grout. All applied before the final warp. */
export interface RenderTiledWallOptions {
  /** Lighting map canvas (size = wall bbox). Applied with multiply blend so tile follows room lighting. */
  lightingCanvas?: HTMLCanvasElement | null;
  /** Strength of lighting multiply (default 1). Values > 1 apply a second multiply pass for stronger falloff (e.g. floor). */
  lightingStrength?: number;
  /** Monochrome noise opacity 0–1 (e.g. 0.015 = 1.5%) to break tile repetition; 0 = off. */
  noiseOpacity?: number;
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

  // --- Lighting: multiply by wall lighting map (only when provided; avoids TV/chair shadows if map is wall-only) ---
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

  // --- Micro noise: overlay subtle random gray to break visible repetition ---
  const noiseOpacity = options?.noiseOpacity ?? 0;
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
