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

**Drop image files into the folder that matches the surface:**

- **`public/tiles/wall/`** — tiles appear only in the Wall viewer
- **`public/tiles/floor/`** — tiles appear only in the Floor viewer
- **`public/tiles/both/`** — tiles appear in both Wall and Floor pickers

The app discovers tiles via the API (folder = surface). No code changes needed.

- **Supported formats:** JPG, PNG, WebP, SVG, GIF, AVIF  
- **Display names** are generated from filenames (e.g. `my-marble-tile.jpg` → “My Marble Tile”). Use hyphens or underscores for multi-word names.  
- Refresh the page after adding or removing files to see the updated list.

## Occlusion strategy

**Current:** Occlusion is implemented. The tile is drawn only where the pipeline decides "wall"; foreground (TV, furniture) punches through and shows the room photo. Priority: depth map → DeepLab wall mask → edge-based mask. See `lib/occlusionMask.ts` and `components/TileOverlayCanvas.tsx`.

**Depth-based (in use):** Use **monocular depth estimation** on the room photo to get a per-pixel depth map. The **manual quad** defines the wall: sample depth at the quad (e.g. median inside the quad or at the four corners) to get “wall depth.” Then draw the tile only where depth is close to that value; pixels with “closer” depth (TV, furniture) keep the original image, so they occlude the tiles. This fits the existing flow: the user already picks the wall; occlusion simply respects “things in front of this surface.”

**Alternatives for later:**

- **Segmentation** — Segment “wall” vs “foreground” and mask the tile to the wall class. Simpler conceptually but must align with the user’s quad; can mislabel in multi-wall or cluttered scenes.
- **Manual occlusion brush** — Let the user paint regions that are in front (e.g. over the TV). No model dependency; useful to refine edges after depth-based occlusion.
- **Refinement** — Erode the depth mask slightly at boundaries, or use a small tolerance band around wall depth, to reduce jagged edges and thin false occluders.
- **WebGL + depth texture** — If depth runs in a pipeline anyway, composite the tile in a fragment shader that samples depth and discards foreground pixels for better performance at high resolution.

## Features & debugging

Quick reference for finding and tuning behaviour when debugging.

| Feature | Where it lives | How to turn off / tune |
|--------|----------------|-------------------------|
| **Edge feathering** | `lib/featherMask.ts` — `createFeatheredQuadMask(..., featherPx)` | In `TileOverlayCanvas.tsx`: change `FEATHER_PX` (default 5). Set to 0 for hard edge. |
| **Micro noise** | `lib/tiledWall.ts` — `renderTiledWall(..., { noiseOpacity })` | In `TileOverlayCanvas.tsx`: set `NOISE_OPACITY` to 0 to disable. |
| **Lighting map** | `lib/lightingMap.ts` — `extractLightingMap(roomImage, quad, ..., wallMask)` | Only used when occlusion is available. Disabled if no occlusion mask. |
| **Occlusion (depth)** | `lib/occlusionMask.ts` — `buildWallMask(..., tolerancePercent, depthCloserIsHigher)` | In `TileOverlayCanvas.tsx`: depth tolerance is `0.15`. Toggle `depthCloserIsHigher` on the page if depth looks inverted. |
| **Occlusion (DeepLab)** | `lib/wallSegmentation.ts`; mask as `wallMask` from `app/page.tsx` | Used when depth is not available. Register WebGL backend before load. |
| **Occlusion (edge)** | `lib/occlusionMask.ts` — `buildOcclusionMask(imageData, dilationIterations)` then `occlusionMaskToWallMask` | Fallback when no depth/wall mask. Edge threshold `avg * 0.85`; `dilationIterations` default 6. |
| **Mask smoothing** | `lib/occlusionMask.ts` — `smoothWallMask(mask, { closeRadius, edgeBlurPx })` | In `TileOverlayCanvas.tsx`: `smoothOpts = { closeRadius: 3, edgeBlurPx: 2 }`. |
| **Tile render pipeline** | `lib/tiledWall.ts` — `renderTiledWall` | Order: pattern → lighting multiply → noise → warp. Options: `lightingCanvas`, `noiseOpacity`. |

**Pipeline summary (TileOverlayCanvas):** (1) Occlusion source: depth → DeepLab → edge; smooth. (2) Combine feathered quad + occlusion (min alpha). (3) If occlusion exists, extract wall-only lighting. (4) Draw tiled wall to offscreen, then destination-in with combined mask.
