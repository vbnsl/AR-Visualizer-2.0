/**
 * Wall detection via DeepLab (ADE20K). Produces a mask: 255 = wall, 0 = non-wall.
 * Used for occlusion so tiles are only shown on segmented wall regions.
 */

const ADE20K_WALL_LABEL = "wall";

export type WallMaskResult = { mask: ImageData; width: number; height: number };

let cachedModel: Awaited<ReturnType<typeof loadDeepLab>> = null;

async function loadDeepLab() {
  // Register WebGL backend before any TF op (fixes "No backend found in registry").
  // Load tfjs-core first so the backend registers with the same instance deeplab uses.
  await import("@tensorflow/tfjs-core");
  await import("@tensorflow/tfjs-backend-webgl");
  const deeplab = await import("@tensorflow-models/deeplab");
  const model = await deeplab.load({ base: "ade20k", quantizationBytes: 2 });
  const labels = deeplab.getLabels("ade20k");
  const wallIndex = labels.findIndex(
    (l) => l.toLowerCase() === ADE20K_WALL_LABEL.toLowerCase()
  );
  if (wallIndex === -1) {
    console.warn("[wall-seg] ADE20K 'wall' label not found, using index 1");
  }
  return { model, wallClassIndex: wallIndex >= 0 ? wallIndex : 1 };
}

function getModel() {
  if (cachedModel) return cachedModel;
  cachedModel = loadDeepLab();
  return cachedModel;
}

/**
 * Segments the image with DeepLab and returns an ImageData mask at target size:
 * alpha 255 where the class is "wall", 0 elsewhere.
 * Use this mask like the depth/edge occlusion mask (combine with quad mask).
 */
export async function segmentWall(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<WallMaskResult | null> {
  if (!imageUrl || targetWidth <= 0 || targetHeight <= 0) return null;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load image for segmentation"));
    el.src = imageUrl;
  });

  const { model, wallClassIndex } = await getModel();
  const rawSeg = model.predict(img);
  const segH = rawSeg.shape[0];
  const segW = rawSeg.shape[1];
  const segData = rawSeg.dataSync();
  rawSeg.dispose();

  const out = new ImageData(targetWidth, targetHeight);
  const data = out.data;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const segX = Math.min(segW - 1, Math.floor((x * segW) / targetWidth));
      const segY = Math.min(segH - 1, Math.floor((y * segH) / targetHeight));
      const classId = Math.round(Number(segData[segY * segW + segX]));
      const isWall = classId === wallClassIndex;
      const i = (y * targetWidth + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = isWall ? 255 : 0;
    }
  }

  return { mask: out, width: targetWidth, height: targetHeight };
}
