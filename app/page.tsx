"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import ImageUpload from "@/components/ImageUpload";
import TilePicker from "@/components/TilePicker";
import CornerHandles, { type Point } from "@/components/CornerHandles";
import VisualizerCanvas from "@/components/VisualizerCanvas";
import TileOverlayCanvas from "@/components/TileOverlayCanvas";
import { TILE_CATALOG, type TileProduct } from "@/lib/catalog";
import { estimateDepth, type DepthResult } from "@/lib/depth";
import { segmentWall } from "@/lib/wallSegmentation";

export default function VisualizerPage() {
  const [roomImageUrl, setRoomImageUrl] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [selectedTile, setSelectedTile] = useState<TileProduct | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [depthMap, setDepthMap] = useState<DepthResult | null>(null);
  const [depthLoading, setDepthLoading] = useState(false);
  const [depthError, setDepthError] = useState<string | null>(null);
  const [wallMask, setWallMask] = useState<ImageData | null>(null);
  const [wallMaskLoading, setWallMaskLoading] = useState(false);
  const [wallMaskError, setWallMaskError] = useState<string | null>(null);
  const [depthCloserIsHigher, setDepthCloserIsHigher] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const compositeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [roomImageUrl]);

  const handleImageLoad = useCallback((url: string) => {
    setRoomImageUrl(url);
    setCorners([]);
    setDepthMap(null);
    setDepthError(null);
    setWallMask(null);
    setWallMaskError(null);
    setDepthLoading(true);
    setWallMaskLoading(true);
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
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (corners.length >= 4) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCorners((prev) => [...prev, { x, y }]);
    },
    [corners.length]
  );

  const handleCornerMove = useCallback((index: number, x: number, y: number) => {
    setCorners((prev) => {
      const next = [...prev];
      if (index >= 0 && index < next.length) next[index] = { x, y };
      return next;
    });
  }, []);

  const handleResetCorners = useCallback(() => setCorners([]), []);

  const handleDownload = useCallback(() => {
    const container = compositeRef.current;
    const canvases = container?.querySelectorAll("canvas");
    if (!canvases?.length) return;
    const roomCanvas = canvases[0] as HTMLCanvasElement;
    const overlayCanvas = canvases.length >= 2 ? (canvases[1] as HTMLCanvasElement) : null;
    const w = overlayCanvas ? overlayCanvas.width : roomCanvas.width;
    const h = overlayCanvas ? overlayCanvas.height : roomCanvas.height;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(roomCanvas, 0, 0, roomCanvas.width, roomCanvas.height, 0, 0, w, h);
    if (overlayCanvas) ctx.drawImage(overlayCanvas, 0, 0);
    const url = off.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "tile-visualizer-result.png";
    a.click();
  }, []);

  const canPlaceCorners = roomImageUrl && corners.length < 4;
  const canDownload = roomImageUrl && corners.length === 4;

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
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Wall corners
                </p>
                {(depthLoading || wallMaskLoading) && (
                  <p className="mb-2 text-sm text-amber-400">
                    Computing depth &amp; wall detection…
                  </p>
                )}
                {depthError && (
                  <p className="mb-2 text-sm text-red-400" title={depthError}>
                    Depth: {depthError}
                  </p>
                )}
                {wallMaskError && !depthMap && (
                  <p className="mb-2 text-sm text-amber-500" title={wallMaskError}>
                    Wall detection: {wallMaskError}
                  </p>
                )}
                {(depthMap || wallMask) && !depthLoading && !wallMaskLoading && (
                  <p className="mb-2 text-sm text-slate-500">
                    Occlusion ready {depthMap ? "(depth)" : wallMask ? "(DeepLab wall)" : ""}
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
                    Depth: higher = closer (toggle if wall/objects are swapped)
                  </label>
                )}
                <p className="mb-2 text-sm text-slate-400">
                  {corners.length < 4
                    ? `Click on the image to place corner ${corners.length + 1} of 4 (top-left → top-right → bottom-right → bottom-left).`
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

              <TilePicker
                tiles={TILE_CATALOG}
                selectedId={selectedTile?.id ?? null}
                onSelect={setSelectedTile}
              />

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

        <main className="relative min-w-0 flex-1">
          {!roomImageUrl ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-900/50">
              <p className="text-slate-500">
                Upload a room photo or use the sample room to start.
              </p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative h-full w-full overflow-hidden rounded-lg"
              style={{ minHeight: 300 }}
              onClick={handleCanvasClick}
              role="presentation"
            >
              <div
                ref={compositeRef}
                className="absolute inset-0"
                style={{
                  cursor: canPlaceCorners ? "crosshair" : "default",
                  width: containerSize.width,
                  height: containerSize.height,
                }}
              >
                <VisualizerCanvas
                  roomImageUrl={roomImageUrl}
                  width={containerSize.width}
                  height={containerSize.height}
                  containerRef={canvasContainerRef}
                />
                <TileOverlayCanvas
                  corners={corners}
                  tileImageUrl={selectedTile?.imageUrl ?? null}
                  tileSizeMm={selectedTile?.sizeMm}
                  width={containerSize.width}
                  height={containerSize.height}
                  depthMap={depthMap}
                  depthCloserIsHigher={depthCloserIsHigher}
                  wallMask={wallMask}
                  roomImageUrl={roomImageUrl}
                />
              </div>
              {roomImageUrl && corners.length > 0 && (
                <CornerHandles
                  corners={corners}
                  onMove={handleCornerMove}
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
