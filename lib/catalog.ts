export interface TileProduct {
  id: string;
  name: string;
  imageUrl: string;
  /** Real-world tile size in mm (for tiled repeat). Default 600×600 if omitted. */
  sizeMm?: { width: number; height: number };
}

export const TILE_CATALOG: TileProduct[] = [
  { id: "matte-marble", name: "Matte Marble", imageUrl: "/tiles/matte-marble.svg" },
  { id: "charcoal-slate", name: "Charcoal Slate", imageUrl: "/tiles/charcoal-slate.svg" },
  { id: "pearl-hex", name: "Pearl Hexagon", imageUrl: "/tiles/pearl-hex.svg" },
  { id: "sandstone-chevron", name: "Sandstone Chevron", imageUrl: "/tiles/sandstone-chevron.svg" },
  { id: "terra-herringbone", name: "Terra Herringbone", imageUrl: "/tiles/terra-herringbone.svg" },
  { id: "5154", name: "5154 Polished", imageUrl: "/tiles/5154.png", sizeMm: { width: 600, height: 600 } },
  { id: "5154A", name: "5154A", imageUrl: "/tiles/5154A.png", sizeMm: { width: 600, height: 600 } },
  { id: "6021-dark", name: "6021 Dark", imageUrl: "/tiles/6021-Dark.png", sizeMm: { width: 600, height: 1200 } },
  { id: "6021-light", name: "6021 Light", imageUrl: "/tiles/6021-Light.png", sizeMm: { width: 600, height: 1200 } },
  { id: "6025-highlighter", name: "6025 Highlighter", imageUrl: "/tiles/6025-Highlighter.png" },
  { id: "6025-light", name: "6025 Light", imageUrl: "/tiles/6025-Light.png" },
  { id: "8173", name: "8173", imageUrl: "/tiles/8173.png" },
  { id: "8174", name: "8174", imageUrl: "/tiles/8174.png" },
  { id: "mosaic-brown", name: "Mosaic Brown Dark", imageUrl: "/tiles/Mosaic Brown Dark.png", sizeMm: { width: 300, height: 300 } },
  { id: "pix-stone", name: "Pix Stone", imageUrl: "/tiles/Pix Stone.png", sizeMm: { width: 450, height: 450 } },
  { id: "squareform-grey", name: "Squareform Grey", imageUrl: "/tiles/Squareform Grey B.png", sizeMm: { width: 300, height: 600 } },
  { id: "terracotta-decor", name: "Smudge Terracotta", imageUrl: "/tiles/Sumdge Teracota Decor.png", sizeMm: { width: 200, height: 200 } },
  { id: "tile1", name: "Tile 1", imageUrl: "/tiles/tile1.jpg", sizeMm: { width: 600, height: 600 } },
  { id: "tile2", name: "Tile 2", imageUrl: "/tiles/tile2.avif" },
];
