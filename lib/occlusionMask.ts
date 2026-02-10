/**
 * Occlusion masks: depth-based (wall vs foreground) or edge-based (smooth wall vs objects).
 * Mask alpha 255 = show tile (wall), 0 = punch through (show room photo).
 */

import type { Quad } from "./tiledWall";

/** Inset in pixels so the quad mask clips the tile edge and avoids rasterization spill. */
const QUAD_MASK_INSET_PX = 2;

/**
 * Creates ImageData: white (255) inside the quad, black (0) outside.
 * Corners are inset toward the quad center to avoid spill at the rasterized edge.
 * Use with destination-in to strictly clip the tile to the selected quad.
 */
export function createQuadMaskImageData(
  width: number,
  height: number,
  points: Quad,
  insetPx: number = QUAD_MASK_INSET_PX
): ImageData {
  const out = new ImageData(width, height);
  const data = out.data;
  for (let i = 3; i < data.length; i += 4) data[i] = 0;

  if (points.length < 4) return out;

  const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
  const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
  const inset = (p: { x: number; y: number }) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const scale = Math.max(0, 1 - insetPx / dist);
    return { x: cx + dx * scale, y: cy + dy * scale };
  };
  const [p0, p1, p2, p3] = points.map(inset);

  const cross = (a: { x: number; y: number }, b: { x: number; y: number }, q: { x: number; y: number }) =>
    (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
  const inside = (x: number, y: number) => {
    const q = { x, y };
    const c0 = cross(p0, p1, q);
    const c1 = cross(p1, p2, q);
    const c2 = cross(p2, p3, q);
    const c3 = cross(p3, p0, q);
    return (c0 >= 0 && c1 >= 0 && c2 >= 0 && c3 >= 0) || (c0 <= 0 && c1 <= 0 && c2 <= 0 && c3 <= 0);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside(x + 0.5, y + 0.5)) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * Combine two masks: result alpha = min(a, b) so tile shows only where both allow.
 */
export function combineMasks(
  width: number,
  height: number,
  maskA: ImageData,
  maskB: ImageData
): ImageData {
  const out = new ImageData(width, height);
  for (let i = 0; i < width * height * 4; i += 4) {
    const a = maskA.data[i + 3];
    const b = maskB.data[i + 3];
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = Math.min(a, b);
  }
  return out;
}

/**
 * Builds an occlusion mask highlighting wall-mounted objects (TV, furniture, etc.)
 * using edge detection + dilation so we can punch through and show the photo there.
 * Returns ImageData with 255 at edges/objects (punch through), 0 elsewhere.
 * Use occlusionMaskToWallMask() to get 255 = show tile for the overlay pipeline.
 */
export function buildOcclusionMask(imageData: ImageData, dilationIterations = 6): ImageData {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return new ImageData(width, height);

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const magnitude = new Float32Array(width * height);
  let sum = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = gray[idx - width - 1];
      const b = gray[idx - width];
      const c = gray[idx - width + 1];
      const d = gray[idx - 1];
      const f = gray[idx + 1];
      const g = gray[idx + width - 1];
      const h = gray[idx + width];
      const iVal = gray[idx + width + 1];
      const gx = -a - 2 * d - g + c + 2 * f + iVal;
      const gy = -a - 2 * b - c + g + 2 * h + iVal;
      const mag = Math.hypot(gx, gy);
      magnitude[idx] = mag;
      sum += mag;
    }
  }

  const avg = sum / (width * height);
  const threshold = Math.max(8, avg * 0.85);
  let mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = magnitude[i] > threshold ? 255 : 0;
  }

  // Slight dilation to preserve shadows
  for (let iter = 0; iter < dilationIterations; iter++) {
    const copy = mask.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx]) {
          copy[idx] = 255;
          continue;
        }
        let hit = 0;
        for (let ky = -1; ky <= 1 && !hit; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ny = y + ky;
            const nx = x + kx;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (mask[ny * width + nx]) {
              hit = 255;
              break;
            }
          }
        }
        copy[idx] = hit;
      }
    }
    mask = copy;
  }

  // Light blur to soften mask edges
  const softened = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumVals = 0;
      let count = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          sumVals += mask[ny * width + nx];
          count++;
        }
      }
      softened[y * width + x] = Math.round(sumVals / Math.max(1, count));
    }
  }

  const maskPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < softened.length; i++) {
    const val = softened[i];
    maskPixels[i * 4] = val;
    maskPixels[i * 4 + 1] = val;
    maskPixels[i * 4 + 2] = val;
    maskPixels[i * 4 + 3] = val;
  }
  return new ImageData(maskPixels, width, height);
}

/**
 * Converts occlusion mask (255 = punch through) to wall mask (255 = show tile).
 */
export function occlusionMaskToWallMask(occlusionMask: ImageData): ImageData {
  const { width, height, data } = occlusionMask;
  const out = new ImageData(width, height);
  for (let i = 0; i < width * height * 4; i += 4) {
    const v = data[i + 3];
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255 - v;
  }
  return out;
}

/**
 * Post-process a wall mask: fill small holes (morphological close) and optionally soften edges.
 * Reduces noisy "holes" and blocky boundaries from segmentation.
 */
export function smoothWallMask(
  mask: ImageData,
  options?: { closeRadius?: number; edgeBlurPx?: number }
): ImageData {
  const { width, height, data } = mask;
  const closeRadius = Math.max(0, Math.min(5, options?.closeRadius ?? 3));
  const edgeBlurPx = Math.max(0, Math.min(4, options?.edgeBlurPx ?? 2));

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];

  const get = (x: number, y: number) => alpha[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];

  if (closeRadius > 0) {
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxV = 0;
        for (let dy = -closeRadius; dy <= closeRadius; dy++) {
          for (let dx = -closeRadius; dx <= closeRadius; dx++) {
            maxV = Math.max(maxV, get(x + dx, y + dy));
          }
        }
        next[y * width + x] = maxV;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minV = 255;
        for (let dy = -closeRadius; dy <= closeRadius; dy++) {
          for (let dx = -closeRadius; dx <= closeRadius; dx++) {
            minV = Math.min(minV, next[(Math.max(0, Math.min(height - 1, y + dy))) * width + Math.max(0, Math.min(width - 1, x + dx))]);
          }
        }
        alpha[y * width + x] = minV;
      }
    }
  }

  if (edgeBlurPx > 0) {
    const next = new Uint8Array(width * height);
    const r = edgeBlurPx;
    const size = (2 * r + 1) ** 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            sum += get(x + dx, y + dy);
          }
        }
        next[y * width + x] = Math.round(sum / size);
      }
    }
    for (let i = 0; i < width * height; i++) alpha[i] = next[i];
  }

  const out = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const j = i * 4;
    out.data[j] = 255;
    out.data[j + 1] = 255;
    out.data[j + 2] = 255;
    out.data[j + 3] = alpha[i];
  }
  return out;
}

/**
 * Edge-detection mask: highlights object boundaries (TV, furniture) with dilation.
 * Returns ImageData with R=G=B=A = 255 at edges, 0 elsewhere.
 */
export function buildEdgeMask(imageData: ImageData, dilationIterations = 6): ImageData {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return new ImageData(width, height);

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const magnitude = new Float32Array(width * height);
  let sum = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = gray[idx - width - 1];
      const b = gray[idx - width];
      const c = gray[idx - width + 1];
      const d = gray[idx - 1];
      const f = gray[idx + 1];
      const g = gray[idx + width - 1];
      const h = gray[idx + width];
      const iVal = gray[idx + width + 1];
      const gx = -a - 2 * d - g + c + 2 * f + iVal;
      const gy = -a - 2 * b - c + g + 2 * h + iVal;
      const mag = Math.hypot(gx, gy);
      magnitude[idx] = mag;
      sum += mag;
    }
  }

  const avg = sum / (width * height);
  const threshold = Math.max(8, avg * 0.85);
  let mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = magnitude[i] > threshold ? 255 : 0;
  }

  for (let iter = 0; iter < dilationIterations; iter++) {
    const copy = mask.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx]) {
          copy[idx] = 255;
          continue;
        }
        let hit = 0;
        for (let ky = -1; ky <= 1 && !hit; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ny = y + ky;
            const nx = x + kx;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (mask[ny * width + nx]) {
              hit = 255;
              break;
            }
          }
        }
        copy[idx] = hit;
      }
    }
    mask = copy;
  }

  const softened = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumVals = 0;
      let count = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          sumVals += mask[ny * width + nx];
          count++;
        }
      }
      softened[y * width + x] = Math.round(sumVals / Math.max(1, count));
    }
  }

  const out = new ImageData(width, height);
  for (let i = 0; i < softened.length; i++) {
    const val = softened[i];
    out.data[i * 4] = val;
    out.data[i * 4 + 1] = val;
    out.data[i * 4 + 2] = val;
    out.data[i * 4 + 3] = val;
  }
  return out;
}

/**
 * Flood-fill "wall" from image border; edges are barriers.
 * So wall = pixels reachable from border without crossing an edge (TV/chair interiors get 0).
 */
function fillWallFromBorder(
  width: number,
  height: number,
  edgeBarrier: Uint8ClampedArray
): Uint8ClampedArray {
  const wall = new Uint8ClampedArray(width * height);
  const queue: number[] = [];
  const push = (idx: number) => {
    if (edgeBarrier[idx] || wall[idx]) return;
    wall[idx] = 255;
    queue.push(idx);
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + (width - 1));
  }
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }
  return wall;
}

/**
 * Wall mask from edge mask: use edges as barriers, flood-fill "wall" from image border.
 * Regions enclosed by edges (TV, chair, etc.) are not reachable → punch through (0).
 */
export function buildWallMaskFromEdges(imageData: ImageData, dilationIterations = 6): ImageData {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return new ImageData(width, height);

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const magnitude = new Float32Array(width * height);
  let sum = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = -gray[idx - width - 1] - 2 * gray[idx - 1] - gray[idx + width - 1] +
        gray[idx - width + 1] + 2 * gray[idx + 1] + gray[idx + width + 1];
      const gy = -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1] +
        gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
      const mag = Math.hypot(gx, gy);
      magnitude[idx] = mag;
      sum += mag;
    }
  }
  const threshold = Math.max(8, (sum / (width * height)) * 0.85);
  let edgeBarrier = new Uint8ClampedArray(width * height);
  for (let i = 0; i < edgeBarrier.length; i++) {
    edgeBarrier[i] = magnitude[i] > threshold ? 255 : 0;
  }

  for (let iter = 0; iter < dilationIterations; iter++) {
    const copy = edgeBarrier.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (edgeBarrier[idx]) {
          copy[idx] = 255;
          continue;
        }
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ny = y + ky;
            const nx = x + kx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && edgeBarrier[ny * width + nx]) {
              copy[idx] = 255;
              break;
            }
          }
        }
      }
    }
    edgeBarrier = copy;
  }

  const wall = fillWallFromBorder(width, height, edgeBarrier);

  const softened = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            s += wall[ny * width + nx];
            c++;
          }
        }
      }
      softened[y * width + x] = c ? Math.round(s / c) : 0;
    }
  }

  const out = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const v = softened[i];
    out.data[i * 4] = 255;
    out.data[i * 4 + 1] = 255;
    out.data[i * 4 + 2] = 255;
    out.data[i * 4 + 3] = v;
  }
  return out;
}

/** Sample depth at (x, y) in depth map coords; x, y can be fractional (bilinear). */
function sampleDepth(
  depth: Float32Array,
  depthWidth: number,
  depthHeight: number,
  x: number,
  y: number
): number {
  const x0 = Math.max(0, Math.min(depthWidth - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(depthHeight - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(depthWidth - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(depthHeight - 1, y0 + 1));
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * depthWidth + x0;
  const i10 = y0 * depthWidth + x1;
  const i01 = y1 * depthWidth + x0;
  const i11 = y1 * depthWidth + x1;
  const v00 = depth[i00];
  const v10 = depth[i10];
  const v01 = depth[i01];
  const v11 = depth[i11];
  return (1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10 + (1 - fx) * fy * v01 + fx * fy * v11;
}

/**
 * Build RGBA ImageData mask for the overlay: alpha = 255 where depth is "wall"
 * (within tolerance of median depth at the quad), alpha = 0 elsewhere.
 * Quad corners are in output pixel coordinates (overlay width x height).
 *
 * depthCloserIsHigher: if true, depth model uses higher value = closer (e.g. disparity).
 * Then wall (far) has lower depth, so we mark wall where d <= wallDepth + delta.
 * If false, higher = farther (wall has higher depth), so wall where d >= wallDepth - delta.
 */
export function buildWallMask(
  depth: Float32Array,
  depthWidth: number,
  depthHeight: number,
  quad: Quad,
  outputWidth: number,
  outputHeight: number,
  tolerancePercent: number = 0.15,
  depthCloserIsHigher: boolean = true
): ImageData {
  const scaleX = depthWidth / outputWidth;
  const scaleY = depthHeight / outputHeight;

  const depthAt = (px: number, py: number) =>
    sampleDepth(depth, depthWidth, depthHeight, px * scaleX, py * scaleY);

  const samples: number[] = [];
  for (const p of quad) {
    samples.push(depthAt(p.x, p.y));
  }
  const midX = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const midY = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  samples.push(depthAt(midX, midY));

  samples.sort((a, b) => a - b);
  const wallDepth = samples[Math.floor(samples.length / 2)];
  const delta = Math.max(1e-5, Math.abs(wallDepth) * tolerancePercent);

  const mask = new ImageData(outputWidth, outputHeight);
  const data = mask.data;

  for (let py = 0; py < outputHeight; py++) {
    for (let px = 0; px < outputWidth; px++) {
      const d = depthAt(px, py);
      const isWall = depthCloserIsHigher
        ? d <= wallDepth + delta   // wall = far = lower depth
        : d >= wallDepth - delta;  // wall = far = higher depth
      const i = (py * outputWidth + px) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = isWall ? 255 : 0;
    }
  }

  return mask;
}
