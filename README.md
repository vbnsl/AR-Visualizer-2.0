# Tile Visualizer

A web app to visualize tiles on your wall: upload a room photo, mark the four corners of the wall, pick a tile, and see a perspective-correct overlay. Similar to [Tilesview.ai](https://tilesview.ai).

## Stack

- **Next.js 14** (App Router) + TypeScript
- **React Three Fiber** + **Three.js** for perspective-correct wall overlay
- **Tailwind CSS** for UI

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to use

1. **Upload a room photo** or click **Use sample room**.
2. **Place 4 corners** on the wall in order: top-left → top-right → bottom-right → bottom-left. Click on the image to add each point; drag the blue handles to adjust.
3. **Choose a tile** from the sidebar. The wall updates with the selected tile texture.
4. **Download result** to save the visualization as a PNG.

## Project structure

- `app/page.tsx` — main visualizer page and state
- `components/VisualizerCanvas.tsx` — R3F scene (room background)
- `components/TileOverlayCanvas.tsx` — 2D canvas overlay (tiled pattern + perspective warp)
- `components/CornerHandles.tsx` — draggable corner markers
- `components/TilePicker.tsx` — tile product grid
- `components/ImageUpload.tsx` — file input and sample room
- `lib/catalog.ts` — tile product list
- `lib/tiledWall.ts` — tiled pattern rendering and quad warp
- `public/tiles/` — tile images (see below for adding your own)
- `public/sample-room.jpg` — default room image

## Adding your own tile images

**Just drop image files into `public/tiles/`.** The app discovers them automatically—no code changes.

- **Supported formats:** JPG, PNG, WebP, SVG, GIF  
- **Display names** are generated from filenames (e.g. `my-marble-tile.jpg` → “My Marble Tile”). Use hyphens or underscores for multi-word names.  
- Refresh the page after adding or removing files to see the updated list.

## Occlusion strategy

**Current:** The tile overlay is drawn on a 2D canvas over the full image, so tiles appear on top of everything (TV, furniture, etc.). There is no occlusion yet.

**Planned approach (depth-based):** Use **monocular depth estimation** on the room photo to get a per-pixel depth map. The **manual quad** defines the wall: sample depth at the quad (e.g. median inside the quad or at the four corners) to get “wall depth.” Then draw the tile only where depth is close to that value; pixels with “closer” depth (TV, furniture) keep the original image, so they occlude the tiles. This fits the existing flow: the user already picks the wall; occlusion simply respects “things in front of this surface.”

**Alternatives for later:**

- **Segmentation** — Segment “wall” vs “foreground” and mask the tile to the wall class. Simpler conceptually but must align with the user’s quad; can mislabel in multi-wall or cluttered scenes.
- **Manual occlusion brush** — Let the user paint regions that are in front (e.g. over the TV). No model dependency; useful to refine edges after depth-based occlusion.
- **Refinement** — Erode the depth mask slightly at boundaries, or use a small tolerance band around wall depth, to reduce jagged edges and thin false occluders.
- **WebGL + depth texture** — If depth runs in a pipeline anyway, composite the tile in a fragment shader that samples depth and discards foreground pixels for better performance at high resolution.
