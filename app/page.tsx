"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import ImageUpload from "@/components/ImageUpload";
import TilePicker from "@/components/TilePicker";
import CornerHandles, { type Point } from "@/components/CornerHandles";
import VisualizerCanvas from "@/components/VisualizerCanvas";
import TileOverlayCanvas from "@/components/TileOverlayCanvas";
import { useTileCatalog, tilesForSurface, type TileProduct } from "@/lib/catalog";
import { estimateDepth, type DepthResult } from "@/lib/depth";
import { segmentWall, segmentFloor } from "@/lib/wallSegmentation";

type ViewMode = "wall" | "floor";

/** Max size of the room view so it doesn't dominate the screen; image fits inside and keeps aspect ratio. */
const MAX_VIEW_WIDTH = 960;
const MAX_VIEW_HEIGHT = 640;

function getDisplaySize(
  naturalWidth: number,
  naturalHeight: number
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0)
    return { width: MAX_VIEW_WIDTH, height: MAX_VIEW_HEIGHT };
  const scale = Math.min(
    MAX_VIEW_WIDTH / naturalWidth,
    MAX_VIEW_HEIGHT / naturalHeight,
    1
  );
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}

export default function VisualizerPage() {
  const [roomImageUrl, setRoomImageUrl] = useState<string | null>(null);
  const [roomImageSize, setRoomImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("wall");
  const [wallCorners, setWallCorners] = useState<Point[]>([]);
  const [floorCorners, setFloorCorners] = useState<Point[]>([]);
  const [selectedWallTile, setSelectedWallTile] = useState<TileProduct | null>(null);
  const [selectedFloorTile, setSelectedFloorTile] = useState<TileProduct | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [depthMap, setDepthMap] = useState<DepthResult | null>(null);
  const [depthLoading, setDepthLoading] = useState(false);
  const [depthError, setDepthError] = useState<string | null>(null);
  const [wallMask, setWallMask] = useState<ImageData | null>(null);
  const [wallMaskLoading, setWallMaskLoading] = useState(false);
  const [wallMaskError, setWallMaskError] = useState<string | null>(null);
  const [floorMask, setFloorMask] = useState<ImageData | null>(null);
  const [floorMaskLoading, setFloorMaskLoading] = useState(false);
  const [floorMaskError, setFloorMaskError] = useState<string | null>(null);
  const [depthCloserIsHigher, setDepthCloserIsHigher] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const compositeRef = useRef<HTMLDivElement>(null);

  const { catalog, loading: catalogLoading, error: catalogError } = useTileCatalog();
  const corners = viewMode === "wall" ? wallCorners : floorCorners;
  const surfaceMask = viewMode === "wall" ? wallMask : floorMask;
  const tilesForCurrentSurface = tilesForSurface(catalog, viewMode);
  const selectedTile = viewMode === "wall" ? selectedWallTile : selectedFloorTile;
  const setSelectedTile = viewMode === "wall" ? setSelectedWallTile : setSelectedFloorTile;

  // Load room image dimensions so we can size the view without stretching
  useEffect(() => {
    if (!roomImageUrl) {
      setRoomImageSize(null);
      return;
    }
    const img = new Image();
    img.onload = () =>
      setRoomImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setRoomImageSize(null);
    img.src = roomImageUrl;
  }, [roomImageUrl]);

  // Display size: fit within max window, preserve aspect ratio, no upscale
  const displaySize =
    roomImageSize && roomImageSize.width > 0 && roomImageSize.height > 0
      ? getDisplaySize(roomImageSize.width, roomImageSize.height)
      : null;

  // Keep containerSize in sync for ref-based logic (e.g. download); view uses displaySize when available
  useEffect(() => {
    if (!displaySize) return;
    setContainerSize(displaySize);
  }, [displaySize?.width, displaySize?.height]);

  const handleImageLoad = useCallback((url: string) => {
    setRoomImageUrl(url);
    setWallCorners([]);
    setFloorCorners([]);
    setDepthMap(null);
    setDepthError(null);
    setWallMask(null);
    setWallMaskError(null);
    setFloorMask(null);
    setFloorMaskError(null);
    setDepthLoading(true);
    setWallMaskLoading(true);
    setFloorMaskLoading(true);
    estimateDepth(url)
      .then(setDepthMap)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Depth failed";
        console.error("[depth]", "Estimate failed:", msg, err);
        setDepthError(msg);
      })
      .finally(() => setDepthLoading(false));
    segmentWall(url, 512, 512)
      .then((res) => (res ? setWallMask(res.mask) : setWallMask(null)))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Wall segmentation failed";
        console.warn("[wall-seg]", msg, err);
        setWallMaskError(msg);
      })
      .finally(() => setWallMaskLoading(false));
    segmentFloor(url, 512, 512)
      .then((res) => (res ? setFloorMask(res.mask) : setFloorMask(null)))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Floor segmentation failed";
        console.warn("[floor-seg]", msg, err);
        setFloorMaskError(msg);
      })
      .finally(() => setFloorMaskLoading(false));
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (corners.length >= 4) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const point = { x, y };
      if (viewMode === "wall") setWallCorners((prev) => [...prev, point]);
      else setFloorCorners((prev) => [...prev, point]);
    },
    [corners.length, viewMode]
  );

  const handleCornerMove = useCallback(
    (index: number, x: number, y: number) => {
      if (viewMode === "wall") {
        setWallCorners((prev) => {
          const next = [...prev];
          if (index >= 0 && index < next.length) next[index] = { x, y };
          return next;
        });
      } else {
        setFloorCorners((prev) => {
          const next = [...prev];
          if (index >= 0 && index < next.length) next[index] = { x, y };
          return next;
        });
      }
    },
    [viewMode]
  );

  const handleResetCorners = useCallback(() => {
    if (viewMode === "wall") setWallCorners([]);
    else setFloorCorners([]);
  }, [viewMode]);

  const handleDownload = useCallback(() => {
    const container = compositeRef.current;
    const canvases = container?.querySelectorAll("canvas");
    if (!canvases?.length) return;
    const roomCanvas = canvases[0] as HTMLCanvasElement;
    const w = roomCanvas.width;
    const h = roomCanvas.height;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(roomCanvas, 0, 0, roomCanvas.width, roomCanvas.height, 0, 0, w, h);
    for (let i = 1; i < canvases.length; i++) {
      ctx.drawImage(canvases[i] as HTMLCanvasElement, 0, 0);
    }
    const url = off.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "tile-visualizer-result.png";
    a.click();
  }, []);

  const canPlaceCorners = roomImageUrl && corners.length < 4;
  const hasWallOverlay = wallCorners.length === 4 && selectedWallTile;
  const hasFloorOverlay = floorCorners.length === 4 && selectedFloorTile;
  const canDownload = roomImageUrl && (hasWallOverlay || hasFloorOverlay);
  const surfaceLabel = viewMode === "wall" ? "Wall" : "Floor";
  const cornerOrderHint =
    viewMode === "wall"
      ? "top-left → top-right → bottom-right → bottom-left"
      : "near-left → near-right → far-right → far-left";

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-700 px-4 py-3">
        <h1 className="text-lg font-semibold">Tile Visualizer</h1>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
        <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-slate-700 pr-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Room photo
            </p>
            <ImageUpload onImageLoad={handleImageLoad} />
          </div>

          {roomImageUrl && (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode("wall")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === "wall"
                      ? "border-blue-500 bg-blue-500/20 text-blue-300"
                      : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                  }`}
                >
                  Wall
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("floor")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === "floor"
                      ? "border-blue-500 bg-blue-500/20 text-blue-300"
                      : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                  }`}
                >
                  Floor
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {surfaceLabel} corners
                </p>
                {(depthLoading || (viewMode === "wall" ? wallMaskLoading : floorMaskLoading)) && (
                  <p className="mb-2 text-sm text-amber-400">
                    Computing depth &amp; {viewMode} detection…
                  </p>
                )}
                {depthError && (
                  <p className="mb-2 text-sm text-red-400" title={depthError}>
                    Depth: {depthError}
                  </p>
                )}
                {viewMode === "wall" && wallMaskError && !depthMap && (
                  <p className="mb-2 text-sm text-amber-500" title={wallMaskError}>
                    Wall detection: {wallMaskError}
                  </p>
                )}
                {viewMode === "floor" && floorMaskError && !depthMap && (
                  <p className="mb-2 text-sm text-amber-500" title={floorMaskError}>
                    Floor detection: {floorMaskError}
                  </p>
                )}
                {(depthMap || surfaceMask) &&
                  !depthLoading &&
                  !(viewMode === "wall" ? wallMaskLoading : floorMaskLoading) && (
                    <p className="mb-2 text-sm text-slate-500">
                      Occlusion ready{" "}
                      {depthMap ? "(depth)" : surfaceMask ? `(DeepLab ${viewMode})` : ""}
                    </p>
                  )}
                {depthMap && (
                  <label className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                    <input
                      type="checkbox"
                      checked={depthCloserIsHigher}
                      onChange={(e) => setDepthCloserIsHigher(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800"
                    />
                    Depth: higher = closer (toggle if surface/objects are swapped)
                  </label>
                )}
                <p className="mb-2 text-sm text-slate-400">
                  {corners.length < 4
                    ? `Click to place corner ${corners.length + 1} of 4 (${cornerOrderHint}).`
                    : "Drag the blue handles to adjust corners."}
                </p>
                {corners.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetCorners}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
                  >
                    Reset corners
                  </button>
                )}
              </div>

              <div>
                {catalogLoading && (
                  <p className="mb-2 text-sm text-slate-500">Loading tiles…</p>
                )}
                {catalogError && (
                  <p className="mb-2 text-sm text-amber-500" title={catalogError}>
                    {catalogError} Add images to <code className="text-xs">public/tiles/wall</code> or{" "}
                    <code className="text-xs">public/tiles/floor</code> (or <code className="text-xs">both</code>).
                  </p>
                )}
                {!catalogLoading && !catalogError && tilesForCurrentSurface.length === 0 && (
                  <p className="mb-2 text-sm text-slate-500">
                    No {viewMode} tiles. Add images to <code className="text-xs">public/tiles/{viewMode}</code> or{" "}
                    <code className="text-xs">public/tiles/both</code>.
                  </p>
                )}
                <TilePicker
                  tiles={tilesForCurrentSurface}
                  selectedId={selectedTile?.id ?? null}
                  onSelect={setSelectedTile}
                />
              </div>

              {canDownload && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                >
                  Download result
                </button>
              )}
            </>
          )}
        </aside>

        <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto p-4">
          {!roomImageUrl ? (
            <div className="flex h-full min-h-[320px] w-full max-w-[960px] items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-900/50">
              <p className="text-slate-500">
                Upload a room photo or use the sample room to start.
              </p>
            </div>
          ) : !displaySize ? (
            <div className="flex min-h-[320px] min-w-[480px] items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80">
              <p className="text-slate-400">Loading image…</p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
              style={{
                width: displaySize.width,
                height: displaySize.height,
              }}
              onClick={handleCanvasClick}
              role="presentation"
            >
              <div
                ref={compositeRef}
                className="absolute inset-0"
                style={{
                  cursor: canPlaceCorners ? "crosshair" : "default",
                  width: displaySize.width,
                  height: displaySize.height,
                }}
              >
                <VisualizerCanvas
                  roomImageUrl={roomImageUrl}
                  width={displaySize.width}
                  height={displaySize.height}
                  containerRef={canvasContainerRef}
                />
                {hasWallOverlay && (
                  <TileOverlayCanvas
                    corners={wallCorners}
                    tileImageUrl={selectedWallTile?.imageUrl ?? null}
                    tileSizeMm={selectedWallTile?.sizeMm}
                    width={displaySize.width}
                    height={displaySize.height}
                    depthMap={depthMap}
                    depthCloserIsHigher={depthCloserIsHigher}
                    wallMask={wallMask}
                    roomImageUrl={roomImageUrl}
                  />
                )}
                {hasFloorOverlay && (
                  <TileOverlayCanvas
                    corners={floorCorners}
                    tileImageUrl={selectedFloorTile?.imageUrl ?? null}
                    tileSizeMm={selectedFloorTile?.sizeMm}
                    width={displaySize.width}
                    height={displaySize.height}
                    depthMap={depthMap}
                    depthCloserIsHigher={depthCloserIsHigher}
                    wallMask={floorMask}
                    roomImageUrl={roomImageUrl}
                  />
                )}
              </div>
              {roomImageUrl && corners.length > 0 && (
                <CornerHandles
                  corners={corners}
                  onMove={handleCornerMove}
                  containerWidth={displaySize.width}
                  containerHeight={displaySize.height}
                  variant={viewMode}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
