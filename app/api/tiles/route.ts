import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/** Image extensions we treat as tile assets. */
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif"]);

function listTileFilenames(dir: string): string[] {
  const fullPath = path.join(process.cwd(), "public", "tiles", dir);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory())
    return [];
  return fs
    .readdirSync(fullPath)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
}

/**
 * GET /api/tiles — Lists tile filenames by folder.
 * Folders: wall, floor, both. Surface is determined by which folder the file is in.
 */
export async function GET() {
  const wall = listTileFilenames("wall");
  const floor = listTileFilenames("floor");
  const both = listTileFilenames("both");

  return NextResponse.json({
    wall,
    floor,
    both,
  });
}
