/**
 * Lighting map from the room image for realistic tile shading and contact shadows.
 *
 * Grayscale is taken from the room image; dark pixels (e.g. under sofa and chair legs)
 * are kept so that when the map is used as a multiply layer, contact shadows anchor
 * furniture on the tiles. preserveForegroundShadows is true by default; we do not
 * replace non-wall pixels with median so real-world shadows are captured.
 *
 * Pipeline: crop to quad bbox → grayscale → blur → normalize to [LIGHTING_FLOOR,255] → canvas.
 */

import type { Quad } from "./tiledWall";
import { quadToBBox } from "./tiledWall";

const DEFAULT_BLUR_RADIUS_PX = 40;
/** Mask alpha >= this treated as "wall"; below = foreground (TV, chair) — not used for lighting sample. */
const WALL_THRESHOLD = 128;
/** Minimum value (0–255) in the lighting map; lower allows much darker contact shadows under furniture. */
const LIGHTING_FLOOR = 85;

function gaussianKernel(radius: number): Float32Array {
  const size = radius * 2 + 1;
  const sigma = radius / 2.5;
  const k = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    k[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += k[i];
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

function blurChannel(
  data: Float32Array,
  width: number,
  height: number,
  radius: number
): void {
  const kernel = gaussianKernel(radius);
  const kSize = radius * 2 + 1;
  const tmp = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kSize; k++) {
        const nx = x + k - radius;
        const clamped = Math.max(0, Math.min(width - 1, nx));
        sum += data[y * width + clamped] * kernel[k];
      }
      tmp[y * width + x] = sum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kSize; k++) {
        const ny = y + k - radius;
        const clamped = Math.max(0, Math.min(height - 1, ny));
        sum += tmp[clamped * width + x] * kernel[k];
      }
      data[y * width + x] = sum;
    }
  }
}

export interface ExtractLightingMapOptions {
  blurRadiusPx?: number;
  /** When true, keep foreground (non-wall) luminance so furniture casts contact shadows onto the tile. */
  preserveForegroundShadows?: boolean;
}

/**
 * Extracts a lighting map from the room image using only wall pixels (from wallMask).
 * Returns a canvas of size (bbox.width × bbox.height) for use as multiply layer, or null if no wall mask.
 */
export function extractLightingMap(
  roomImage: HTMLImageElement,
  quad: Quad,
  fullWidth: number,
  fullHeight: number,
  wallMask: ImageData,
  blurRadiusPxOrOptions: number | ExtractLightingMapOptions = DEFAULT_BLUR_RADIUS_PX
): HTMLCanvasElement | null {
  const opts = typeof blurRadiusPxOrOptions === "object"
    ? blurRadiusPxOrOptions
    : { blurRadiusPx: blurRadiusPxOrOptions };
  const blurRadiusPx = opts.blurRadiusPx ?? DEFAULT_BLUR_RADIUS_PX;
  const bbox = quadToBBox(quad);
  const w = Math.max(1, Math.floor(bbox.width));
  const h = Math.max(1, Math.floor(bbox.height));
  const bx = Math.max(0, Math.min(fullWidth - 1, Math.floor(bbox.x)));
  const by = Math.max(0, Math.min(fullHeight - 1, Math.floor(bbox.y)));
  const cropW = Math.min(w, fullWidth - bx);
  const cropH = Math.min(h, fullHeight - by);
  if (cropW <= 0 || cropH <= 0) return null;

  const full = document.createElement("canvas");
  full.width = fullWidth;
  full.height = fullHeight;
  const fullCtx = full.getContext("2d");
  if (!fullCtx) return null;
  fullCtx.drawImage(roomImage, 0, 0, fullWidth, fullHeight);
  const fullData = fullCtx.getImageData(bx, by, cropW, cropH);

  const gray = new Float32Array(cropW * cropH);
  for (let py = 0; py < cropH; py++) {
    for (let px = 0; px < cropW; px++) {
      const g = 0.299 * fullData.data[(py * cropW + px) * 4] +
        0.587 * fullData.data[(py * cropW + px) * 4 + 1] +
        0.114 * fullData.data[(py * cropW + px) * 4 + 2];
      gray[py * cropW + px] = g;
    }
  }

  const radius = Math.max(1, Math.min(50, Math.floor(blurRadiusPx / 2)));
  blurChannel(gray, cropW, cropH, radius);

  let minV = gray[0];
  let maxV = gray[0];
  for (let i = 1; i < gray.length; i++) {
    minV = Math.min(minV, gray[i]);
    maxV = Math.max(maxV, gray[i]);
  }
  const range = maxV - minV || 1;
  // Remap from [0,255] to [LIGHTING_FLOOR,255] so multiply never creates black bands at edges
  const scale = (255 - LIGHTING_FLOOR) / 255;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  const outData = outCtx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const srcIdx = py < cropH && px < cropW ? py * cropW + px : 0;
      const n = range > 0 ? (gray[srcIdx] - minV) / range : 1;
      const v = Math.round(LIGHTING_FLOOR + scale * 255 * n);
      const clamped = Math.max(0, Math.min(255, v));
      const i = (py * w + px) * 4;
      outData.data[i] = clamped;
      outData.data[i + 1] = clamped;
      outData.data[i + 2] = clamped;
      outData.data[i + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}

/** Luminance threshold above which pixels are treated as highlights (ceiling/light reflections). */
const SPECULAR_THRESHOLD = 180;
const SPECULAR_BLUR_RADIUS = 8;

/**
 * Extracts a specular map from the room image: isolates the brightest pixels (ceiling light
 * reflections on the floor). Use with screen blend and ~0.3 opacity to give tiles a glossy sheen.
 * Returns a canvas of size (bbox.width × bbox.height), or null on failure.
 */
export function extractSpecularMap(
  roomImage: HTMLImageElement,
  quad: Quad,
  fullWidth: number,
  fullHeight: number
): HTMLCanvasElement | null {
  const bbox = quadToBBox(quad);
  const w = Math.max(1, Math.floor(bbox.width));
  const h = Math.max(1, Math.floor(bbox.height));
  const bx = Math.max(0, Math.min(fullWidth - 1, Math.floor(bbox.x)));
  const by = Math.max(0, Math.min(fullHeight - 1, Math.floor(bbox.y)));
  const cropW = Math.min(w, fullWidth - bx);
  const cropH = Math.min(h, fullHeight - by);
  if (cropW <= 0 || cropH <= 0) return null;

  const full = document.createElement("canvas");
  full.width = fullWidth;
  full.height = fullHeight;
  const fullCtx = full.getContext("2d");
  if (!fullCtx) return null;
  fullCtx.drawImage(roomImage, 0, 0, fullWidth, fullHeight);
  const fullData = fullCtx.getImageData(bx, by, cropW, cropH);

  const highlight = new Float32Array(cropW * cropH);
  for (let py = 0; py < cropH; py++) {
    for (let px = 0; px < cropW; px++) {
      const L = 0.299 * fullData.data[(py * cropW + px) * 4] +
        0.587 * fullData.data[(py * cropW + px) * 4 + 1] +
        0.114 * fullData.data[(py * cropW + px) * 4 + 2];
      if (L >= SPECULAR_THRESHOLD) {
        const t = (L - SPECULAR_THRESHOLD) / (255 - SPECULAR_THRESHOLD);
        highlight[py * cropW + px] = Math.min(255, t * 255);
      } else {
        highlight[py * cropW + px] = 0;
      }
    }
  }

  const radius = Math.max(1, Math.min(20, SPECULAR_BLUR_RADIUS));
  blurChannel(highlight, cropW, cropH, radius);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  const outData = outCtx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const srcIdx = py < cropH && px < cropW ? py * cropW + px : 0;
      const v = Math.round(Math.max(0, Math.min(255, highlight[srcIdx])));
      const i = (py * w + px) * 4;
      outData.data[i] = v;
      outData.data[i + 1] = v;
      outData.data[i + 2] = v;
      outData.data[i + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}
