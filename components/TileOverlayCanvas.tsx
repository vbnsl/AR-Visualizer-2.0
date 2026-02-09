"use client";

import { useRef, useEffect, useState } from "react";
import { renderTiledWall, type Quad } from "@/lib/tiledWall";

export interface Point {
  x: number;
  y: number;
}

/** Default wall size in mm when using tiled render (standard wall ~3m x 2.4m). */
const DEFAULT_WALL_WIDTH_MM = 3000;
const DEFAULT_WALL_HEIGHT_MM = 2400;
/** Default tile size in mm (30cm x 30cm) when catalog has no sizeMm. */
const DEFAULT_TILE_SIZE_MM = { width: 300, height: 300 };

interface TileOverlayCanvasProps {
  corners: Point[];
  tileImageUrl: string | null;
  /** Tile size in mm (from catalog). If set, uses renderTiledWall for repeating pattern. */
  tileSizeMm?: { width: number; height: number };
  width: number;
  height: number;
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
}: TileOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageReady, setImageReady] = useState(false);

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
    renderTiledWall(ctx, quad, img, tileMm, wallSizeMm);
  }, [corners, imageReady, width, height, tileSizeMm]);

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
