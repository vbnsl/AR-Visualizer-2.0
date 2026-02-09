"use client";

import { useCallback, useState, useEffect, useRef } from "react";

export interface Point {
  x: number;
  y: number;
}

interface CornerHandlesProps {
  corners: Point[];
  onMove: (index: number, x: number, y: number) => void;
  containerWidth: number;
  containerHeight: number;
}

const HANDLE_SIZE = 24;

export default function CornerHandles({
  corners,
  onMove,
  containerWidth,
  containerHeight,
}: CornerHandlesProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(index);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (dragging === null || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      onMove(dragging, x, y);
    },
    [dragging, onMove]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging === null) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragging, handlePointerMove, handlePointerUp]);

  if (corners.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="corner-handles-container pointer-events-none absolute inset-0"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {corners.map((p, i) => (
        <div
          key={i}
          className="pointer-events-auto absolute cursor-grab rounded-full border-2 border-white bg-blue-500 shadow-lg active:cursor-grabbing"
          style={{
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            left: p.x - HANDLE_SIZE / 2,
            top: p.y - HANDLE_SIZE / 2,
          }}
          onPointerDown={(e) => handlePointerDown(e, i)}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      ))}
    </div>
  );
}
