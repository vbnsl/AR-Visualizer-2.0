"use client";

import { useRef, useEffect, useState } from "react";

export interface Point {
  x: number;
  y: number;
}

interface TileOverlayCanvasProps {
  corners: Point[];
  tileImageUrl: string | null;
  width: number;
  height: number;
}

/**
 * 2D canvas overlay that draws the tile image exactly inside the quad defined by the 4 corners.
 * Uses two triangles with affine mapping so the texture fills the quad (no 3D unprojection).
 */
export default function TileOverlayCanvas({
  corners,
  tileImageUrl,
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

    const [p0, p1, p2, p3] = corners; // top-left, top-right, bottom-right, bottom-left

    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const drawTriangle = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      tx0: number,
      ty0: number,
      tx1: number,
      ty1: number,
      tx2: number,
      ty2: number
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.clip();
      // Affine map: (tx0,ty0)->(x0,y0), (tx1,ty1)->(x1,y1), (tx2,ty2)->(x2,y2)
      const denom = (tx1 - tx0) * (ty2 - ty0) - (ty1 - ty0) * (tx2 - tx0);
      if (Math.abs(denom) < 1e-10) {
        ctx.restore();
        return;
      }
      const a = ((x1 - x0) * (ty2 - ty0) - (x2 - x0) * (ty1 - ty0)) / denom;
      const b = ((x2 - x0) * (tx1 - tx0) - (x1 - x0) * (tx2 - tx0)) / denom;
      const c = ((y1 - y0) * (ty2 - ty0) - (y2 - y0) * (ty1 - ty0)) / denom;
      const d = ((y2 - y0) * (tx1 - tx0) - (y1 - y0) * (tx2 - tx0)) / denom;
      const e = x0 - a * tx0 - b * ty0;
      const f = y0 - c * tx0 - d * ty0;
      ctx.setTransform(a, c, b, d, e, f);
      ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
      ctx.restore();
    };

    // Triangle 1: top-left, top-right, bottom-right. Texture: (0,0), (w,0), (w,h)
    drawTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, 0, 0, w, 0, w, h);
    // Triangle 2: top-left, bottom-right, bottom-left. Texture: (0,0), (w,h), (0,h)
    drawTriangle(p0.x, p0.y, p2.x, p2.y, p3.x, p3.y, 0, 0, w, h, 0, h);
  }, [corners, imageReady, width, height]);

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
