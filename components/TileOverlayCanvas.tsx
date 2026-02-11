"use client";

/**
 * Tile overlay: draws a perspective-correct tiled wall on a 2D canvas over the room image.
 *
 * Pipeline:
 * 1. Occlusion source (priority): depth map → DeepLab wall mask → edge-based mask. Result smoothed (smoothWallMask).
 * 2. Combine feathered quad mask with occlusion mask (min alpha) so tile is clipped to quad and respects occlusion.
 * 3. If we have occlusion, extract wall-only lighting from room (extractLightingMap) so TV/chair don't cast shadows.
 * 4. Render tiled wall to offscreen (renderTiledWall with optional lighting + noise), then destination-in with combined mask.
 */

import { useRef, useEffect, useState } from "react";
import { renderTiledWall, type Quad } from "@/lib/tiledWall";
import {
  buildWallMask,
  buildOcclusionMask,
  occlusionMaskToWallMask,
  combineMasks,
  smoothWallMask,
} from "@/lib/occlusionMask";
import { createFeatheredQuadMask } from "@/lib/featherMask";
import { extractLightingMap } from "@/lib/lightingMap";
import type { DepthResult } from "@/lib/depth";
import { quadToBBox } from "@/lib/tiledWall";

function createCanvasFromImageData(id: ImageData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = id.width;
  c.height = id.height;
  c.getContext("2d")?.putImageData(id, 0, 0);
  return c;
}

export interface Point {
  x: number;
  y: number;
}

/** Default wall size in mm when using tiled render (standard wall ~3m x 2.4m). */
const DEFAULT_WALL_WIDTH_MM = 3000;
const DEFAULT_WALL_HEIGHT_MM = 2400;
/** Default tile size in mm (30cm x 30cm) when catalog has no sizeMm. */
const DEFAULT_TILE_SIZE_MM = { width: 300, height: 300 };
const FEATHER_PX = 5;
const NOISE_OPACITY = 0.015;
/** For floor only: darken the "far" (top) part of the quad to suggest depth. 0 = off, ~0.2 = subtle. */
const FLOOR_DEPTH_GRADIENT_STRENGTH = 0.2;
/** For floor only: stronger lighting multiply so room falloff is more visible (1 = same as wall). */
const FLOOR_LIGHTING_STRENGTH = 1.2;
/** For floor only: subtle desaturation toward far (top) edge for atmospheric depth. 0 = off, ~0.12 = subtle. */
const FLOOR_ATMOSPHERIC_STRENGTH = 0.12;
/** For floor only: subtle darkening toward quad edges (vignette) so floor feels inset. 0 = off, ~0.08 = subtle. */
const FLOOR_EDGE_VIGNETTE = 0.08;
/** For floor only: extra feather at quad edges for softer blend with room (wall uses FEATHER_PX). */
const FLOOR_FEATHER_PX = 8;
/** For floor only: slightly higher micro-noise to break repetition (wall uses NOISE_OPACITY). */
const FLOOR_NOISE_OPACITY = 0.02;

interface TileOverlayCanvasProps {
  corners: Point[];
  tileImageUrl: string | null;
  /** Tile size in mm (from catalog). If set, uses renderTiledWall for repeating pattern. */
  tileSizeMm?: { width: number; height: number };
  width: number;
  height: number;
  /** Optional depth map for occlusion (tile only where depth is "wall"). */
  depthMap?: DepthResult | null;
  /** If true, depth model uses higher value = closer (wall = lower depth). If false, higher = farther. */
  depthCloserIsHigher?: boolean;
  /** Optional DeepLab wall mask (alpha 255 = wall). Used when depth is unavailable. */
  wallMask?: ImageData | null;
  /** Room image URL for edge-based occlusion when depth and wall mask unavailable. */
  roomImageUrl?: string | null;
  /** "floor" applies an extra depth gradient (darker toward far edge). Default "wall". */
  surface?: "wall" | "floor";
}

/**
 * 2D canvas overlay: draws the tile inside the quad. If tileSizeMm is provided,
 * uses renderTiledWall (createPattern + perspective warp); otherwise single image warp.
 */
export default function TileOverlayCanvas({
  corners,
  tileImageUrl,
  tileSizeMm,
  width,
  height,
  depthMap,
  depthCloserIsHigher = true,
  wallMask,
  roomImageUrl,
  surface = "wall",
}: TileOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const roomImageRef = useRef<HTMLImageElement | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [roomImageReady, setRoomImageReady] = useState(false);
  const [edgeMask, setEdgeMask] = useState<ImageData | null>(null);

  useEffect(() => {
    if (!tileImageUrl) {
      imageRef.current = null;
      setImageReady(false);
      return;
    }
    setImageReady(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageReady(true);
    };
    img.src = tileImageUrl;
    return () => {
      imageRef.current = null;
    };
  }, [tileImageUrl]);

  useEffect(() => {
    if (!roomImageUrl || !width || !height) {
      roomImageRef.current = null;
      setRoomImageReady(false);
      setEdgeMask(null);
      return;
    }
    setEdgeMask(null);
    setRoomImageReady(false);
    const roomImg = new Image();
    roomImg.crossOrigin = "anonymous";
    roomImg.onload = () => {
      roomImageRef.current = roomImg;
      setRoomImageReady(true);
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(roomImg, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      setEdgeMask(occlusionMaskToWallMask(buildOcclusionMask(imageData)));
    };
    roomImg.src = roomImageUrl;
    return () => {
      roomImageRef.current = null;
    };
  }, [roomImageUrl, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || corners.length !== 4 || !img || !imageReady || !width || !height)
      return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const quad: Quad = [corners[0], corners[1], corners[2], corners[3]];

    const tileMm =
      tileSizeMm && tileSizeMm.width > 0 && tileSizeMm.height > 0
        ? tileSizeMm
        : DEFAULT_TILE_SIZE_MM;
    const wallSizeMm = {
      width: DEFAULT_WALL_WIDTH_MM,
      height: DEFAULT_WALL_HEIGHT_MM,
    };

    const featherPx = surface === "floor" ? FLOOR_FEATHER_PX : FEATHER_PX;
    const quadMask = createFeatheredQuadMask(width, height, quad, featherPx);
    const smoothOpts = { closeRadius: 3, edgeBlurPx: 2 };
    // Occlusion source (priority): depth → DeepLab wall mask → edge-based; then smooth
    let occlusionMask: ImageData | null = null;
    if (depthMap) {
      const raw = buildWallMask(
        depthMap.depth,
        depthMap.width,
        depthMap.height,
        quad,
        width,
        height,
        0.15,
        depthCloserIsHigher
      );
      occlusionMask = smoothWallMask(raw, smoothOpts);
    } else if (wallMask) {
      let raw: ImageData | null = null;
      if (wallMask.width === width && wallMask.height === height) {
        raw = wallMask;
      } else {
        const scaled = document.createElement("canvas");
        scaled.width = width;
        scaled.height = height;
        const sctx = scaled.getContext("2d");
        if (sctx) {
          sctx.drawImage(
            createCanvasFromImageData(wallMask),
            0,
            0,
            wallMask.width,
            wallMask.height,
            0,
            0,
            width,
            height
          );
          raw = sctx.getImageData(0, 0, width, height);
        }
      }
      if (raw) occlusionMask = smoothWallMask(raw, smoothOpts);
    }
    if (!occlusionMask) occlusionMask = edgeMask ? smoothWallMask(edgeMask, smoothOpts) : null;

    // Combine feathered quad with occlusion so tile is clipped to quad and respects foreground
    const mask = occlusionMask
      ? combineMasks(width, height, quadMask, occlusionMask)
      : quadMask;

    // Wall-only lighting (only when we have occlusion so TV/chair don't cast shadows)
    let lightingCanvas: HTMLCanvasElement | null = null;
    if (roomImageRef.current && occlusionMask) {
      lightingCanvas = extractLightingMap(
        roomImageRef.current,
        quad,
        width,
        height,
        occlusionMask
      );
    }
    const bbox = quadToBBox(quad);
    const wallW = Math.max(1, bbox.width);
    const wallH = Math.max(1, bbox.height);
    if (lightingCanvas && (lightingCanvas.width !== wallW || lightingCanvas.height !== wallH)) {
      lightingCanvas = null;
    }

    // Render tiled wall to offscreen then destination-in with combined mask
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const offCtx = off.getContext("2d");
    if (offCtx) {
      renderTiledWall(offCtx, quad, img, tileMm, wallSizeMm, {
        lightingCanvas: lightingCanvas ?? undefined,
        lightingStrength: surface === "floor" ? FLOOR_LIGHTING_STRENGTH : undefined,
        noiseOpacity: surface === "floor" ? FLOOR_NOISE_OPACITY : NOISE_OPACITY,
      });
      // Floor only: darken the "far" (top) part of the quad to suggest depth
      if (surface === "floor" && FLOOR_DEPTH_GRADIENT_STRENGTH > 0) {
        const bbox = quadToBBox(quad);
        const [p0, p1, p2, p3] = quad;
        offCtx.save();
        offCtx.beginPath();
        offCtx.moveTo(p0.x, p0.y);
        offCtx.lineTo(p1.x, p1.y);
        offCtx.lineTo(p2.x, p2.y);
        offCtx.lineTo(p3.x, p3.y);
        offCtx.closePath();
        offCtx.clip();
        const dark = Math.round(255 * (1 - FLOOR_DEPTH_GRADIENT_STRENGTH));
        const grad = offCtx.createLinearGradient(bbox.x, bbox.y, bbox.x, bbox.y + bbox.height);
        grad.addColorStop(0, `rgb(${dark},${dark},${dark})`);
        grad.addColorStop(1, "rgb(255,255,255)");
        offCtx.globalCompositeOperation = "multiply";
        offCtx.fillStyle = grad;
        offCtx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
        offCtx.restore();
      }
      // Floor only: subtle desaturation toward far (top) edge (atmospheric perspective)
      if (surface === "floor" && FLOOR_ATMOSPHERIC_STRENGTH > 0) {
        const bbox = quadToBBox(quad);
        const [p0, p1, p2, p3] = quad;
        offCtx.save();
        offCtx.beginPath();
        offCtx.moveTo(p0.x, p0.y);
        offCtx.lineTo(p1.x, p1.y);
        offCtx.lineTo(p2.x, p2.y);
        offCtx.lineTo(p3.x, p3.y);
        offCtx.closePath();
        offCtx.clip();
        const grayAlpha = Math.min(1, FLOOR_ATMOSPHERIC_STRENGTH);
        const atmos = offCtx.createLinearGradient(bbox.x, bbox.y, bbox.x, bbox.y + bbox.height);
        atmos.addColorStop(0, `rgba(128,128,128,${grayAlpha})`);
        atmos.addColorStop(1, "rgba(128,128,128,0)");
        offCtx.globalCompositeOperation = "color";
        offCtx.fillStyle = atmos;
        offCtx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
        offCtx.restore();
      }
      // Floor only: subtle edge vignette (darker toward quad edges)
      if (surface === "floor" && FLOOR_EDGE_VIGNETTE > 0) {
        const bbox = quadToBBox(quad);
        const [p0, p1, p2, p3] = quad;
        offCtx.save();
        offCtx.beginPath();
        offCtx.moveTo(p0.x, p0.y);
        offCtx.lineTo(p1.x, p1.y);
        offCtx.lineTo(p2.x, p2.y);
        offCtx.lineTo(p3.x, p3.y);
        offCtx.closePath();
        offCtx.clip();
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;
        const r = Math.max(bbox.width, bbox.height) / 2;
        const dark = Math.round(255 * (1 - FLOOR_EDGE_VIGNETTE));
        const vig = offCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
        vig.addColorStop(0, "rgb(255,255,255)");
        vig.addColorStop(1, `rgb(${dark},${dark},${dark})`);
        offCtx.globalCompositeOperation = "multiply";
        offCtx.fillStyle = vig;
        offCtx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
        offCtx.restore();
      }
      ctx.drawImage(off, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskCtx = maskCanvas.getContext("2d");
      if (maskCtx) {
        maskCtx.putImageData(mask, 0, 0);
        ctx.drawImage(maskCanvas, 0, 0);
      }
      ctx.globalCompositeOperation = "source-over";
    } else {
      renderTiledWall(ctx, quad, img, tileMm, wallSizeMm, {
        lightingCanvas: lightingCanvas ?? undefined,
        lightingStrength: surface === "floor" ? FLOOR_LIGHTING_STRENGTH : undefined,
        noiseOpacity: surface === "floor" ? FLOOR_NOISE_OPACITY : NOISE_OPACITY,
      });
    }
  }, [corners, imageReady, roomImageReady, width, height, tileSizeMm, depthMap, depthCloserIsHigher, wallMask, edgeMask, surface]);

  if (corners.length !== 4 || !tileImageUrl || !width || !height)
    return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute left-0 top-0"
      style={{ width, height }}
      width={width}
      height={height}
    />
  );
}
