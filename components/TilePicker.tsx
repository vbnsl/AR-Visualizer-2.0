"use client";

import Image from "next/image";
import type { TileProduct } from "@/lib/catalog";

/** Format tile size for display: "W×H cm". Uses default by surface when sizeMm is missing. */
function formatTileSize(tile: TileProduct): string {
  if (tile.sizeMm && tile.sizeMm.width > 0 && tile.sizeMm.height > 0) {
    const w = Math.round(tile.sizeMm.width / 10);
    const h = Math.round(tile.sizeMm.height / 10);
    return `${w}×${h} cm`;
  }
  if (tile.surface === "floor") return "60×60 cm";
  if (tile.surface === "wall") return "30×30 cm";
  return "—";
}

interface TilePickerProps {
  tiles: TileProduct[];
  selectedId: string | null;
  onSelect: (tile: TileProduct) => void;
}

export default function TilePicker({
  tiles,
  selectedId,
  onSelect,
}: TilePickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Choose a tile
      </p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onSelect(tile)}
            className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
              selectedId === tile.id
                ? "border-blue-500 ring-2 ring-blue-500/30"
                : "border-slate-600 hover:border-slate-500"
            }`}
          >
            <Image
              src={tile.imageUrl}
              alt={tile.name}
              fill
              className="object-cover"
              sizes="120px"
              unoptimized
            />
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-1.5 text-center text-xs text-white">
              <span className="block truncate font-medium">{tile.name}</span>
              <span className="block text-[10px] text-slate-300">
                {formatTileSize(tile)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
