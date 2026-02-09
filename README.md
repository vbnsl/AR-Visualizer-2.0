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
- `components/VisualizerCanvas.tsx` — R3F scene (background + wall plane)
- `components/CornerHandles.tsx` — draggable corner markers
- `components/TilePicker.tsx` — tile product grid
- `components/ImageUpload.tsx` — file input and sample room
- `lib/catalog.ts` — tile product list
- `lib/wallGeometry.ts` — unproject screen points to 3D and build wall quad
- `public/tiles/` — tile images (see below for adding your own)
- `public/sample-room.jpg` — default room image

## Adding your own tile images

**Just drop image files into `public/tiles/`.** The app discovers them automatically—no code changes.

- **Supported formats:** JPG, PNG, WebP, SVG, GIF  
- **Display names** are generated from filenames (e.g. `my-marble-tile.jpg` → “My Marble Tile”). Use hyphens or underscores for multi-word names.  
- Refresh the page after adding or removing files to see the updated list.

## Later ideas

- Occlusion (objects in front of the wall)
- Floor visualization (second quad)
- Side-by-side comparison, save/load designs, backend catalog
