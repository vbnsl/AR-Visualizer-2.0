"use client";

import { useState, useEffect, useCallback } from "react";

export type TileSurface = "wall" | "floor" | "both";

export interface TileProduct {
  id: string;
  name: string;
  imageUrl: string;
  /** Real-world tile size in mm (for tiled repeat). Default 600×600 if omitted. */
  sizeMm?: { width: number; height: number };
  /** Which surface(s) this tile is for; set from folder (wall, floor, or both). */
  surface: TileSurface;
}

/** Tiles that can be used for the given surface (wall or floor). */
export function tilesForSurface(
  tiles: TileProduct[],
  surface: "wall" | "floor"
): TileProduct[] {
  return tiles.filter((t) => t.surface === "both" || t.surface === surface);
}

/** Turn a filename into a stable id and display name. */
function filenameToIdAndName(filename: string): { id: string; name: string } {
  const base = filename.replace(/\.[^.]+$/i, "");
  const id = base
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const name = base.replace(/[-_]+/g, " ");
  const nameTitle = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return { id: id || "tile", name: nameTitle || filename };
}

export type TilesApiResponse = { wall: string[]; floor: string[]; both: string[] };

/** Build catalog from API response: surface comes from the folder each file is in. */
export function buildCatalogFromFolders(res: TilesApiResponse): TileProduct[] {
  const out: TileProduct[] = [];
  const seen = new Set<string>();

  for (const folder of ["wall", "floor", "both"] as const) {
    const files = res[folder] ?? [];
    for (const filename of files) {
      const { id, name } = filenameToIdAndName(filename);
      const uniqueId = `${folder}-${id}-${filename}`;
      if (seen.has(uniqueId)) continue;
      seen.add(uniqueId);
      out.push({
        id: uniqueId,
        name,
        imageUrl: `/tiles/${folder}/${encodeURIComponent(filename)}`,
        surface: folder,
      });
    }
  }

  return out;
}

export function useTileCatalog(): {
  catalog: TileProduct[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [catalog, setCatalog] = useState<TileProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tiles");
      if (!res.ok) throw new Error("Failed to load tiles");
      const data: TilesApiResponse = await res.json();
      setCatalog(buildCatalogFromFolders(data));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return { catalog, loading, error, refetch: fetchCatalog };
}
