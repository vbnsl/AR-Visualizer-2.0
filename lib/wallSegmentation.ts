/**
 * Surface detection via DeepLab (ADE20K). Produces masks: 255 = target class, 0 = elsewhere.
 * Used for occlusion so tiles are only shown on segmented wall or floor regions.
 */

export type SurfaceMaskResult = { mask: ImageData; width: number; height: number };

type CachedModel = {
  model: Awaited<ReturnType<typeof import("@tensorflow-models/deeplab").load>>;
  wallClassIndex: number;
  floorClassIndex: number;
};

let cachedModel: Promise<CachedModel> | null = null;

async function loadDeepLab(): Promise<CachedModel> {
  await import("@tensorflow/tfjs-core");
  await import("@tensorflow/tfjs-backend-webgl");
  const deeplab = await import("@tensorflow-models/deeplab");
  const model = await deeplab.load({ base: "ade20k", quantizationBytes: 2 });
  const labels = deeplab.getLabels("ade20k");
  const findClass = (name: string) => {
    const i = labels.findIndex((l) => l.toLowerCase() === name.toLowerCase());
    return i >= 0 ? i : 1;
  };
  const wallClassIndex = findClass("wall");
  const floorClassIndex = findClass("floor");
  if (labels.findIndex((l) => l.toLowerCase() === "wall") === -1)
    console.warn("[surface-seg] ADE20K 'wall' not found, using index 1");
  if (labels.findIndex((l) => l.toLowerCase() === "floor") === -1)
    console.warn("[surface-seg] ADE20K 'floor' not found, using fallback index");
  return { model, wallClassIndex, floorClassIndex };
}

function getModel() {
  if (!cachedModel) cachedModel = loadDeepLab();
  return cachedModel;
}

async function segmentByClass(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number,
  classIndex: number
): Promise<SurfaceMaskResult | null> {
  if (!imageUrl || targetWidth <= 0 || targetHeight <= 0) return null;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load image for segmentation"));
    el.src = imageUrl;
  });

  const { model } = await getModel();
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
      const id = Math.round(Number(segData[segY * segW + segX]));
      const hit = id === classIndex;
      const i = (y * targetWidth + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = hit ? 255 : 0;
    }
  }

  return { mask: out, width: targetWidth, height: targetHeight };
}

/**
 * Segments the image and returns a mask: alpha 255 where class is "wall", 0 elsewhere.
 */
export async function segmentWall(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<SurfaceMaskResult | null> {
  const { wallClassIndex } = await getModel();
  return segmentByClass(imageUrl, targetWidth, targetHeight, wallClassIndex);
}

/**
 * Segments the image and returns a mask: alpha 255 where class is "floor", 0 elsewhere.
 * Used for floor viewer occlusion (depth + edge remain fallbacks).
 */
export async function segmentFloor(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number
): Promise<SurfaceMaskResult | null> {
  const { floorClassIndex } = await getModel();
  return segmentByClass(imageUrl, targetWidth, targetHeight, floorClassIndex);
}
