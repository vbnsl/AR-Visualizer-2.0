/**
 * Monocular depth estimation for occlusion. Loads Depth Anything ONNX (quantized)
 * from CDN at runtime to avoid bundling issues with Next.js. Depth map: higher value = farther (wall).
 */

/** Same-origin: no CORS. Place the file in public/models/ (see public/models/README.md). */
const DEPTH_MODEL_LOCAL = "/models/depthanything-quant.onnx";
const DEPTH_MODEL_DATA_LOCAL = "/models/depthanything-quant.onnx_data";
const DEPTH_MODEL_PROXY = "/api/depth-model";
const DEPTH_MODEL_CDN =
  "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanything-quant.onnx";
const DEPTH_MODEL_DATA_CDN =
  "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanything-quant.onnx_data";
const ORT_SCRIPT_URLS = [
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.1/dist/ort.min.js",
  "https://unpkg.com/onnxruntime-web@1.24.1/dist/ort.min.js",
];
const DEPTH_INPUT_SIZE = 384;

export interface DepthResult {
  depth: Float32Array;
  width: number;
  height: number;
}

declare global {
  interface Window {
    ort?: {
      InferenceSession: {
        create(
          urlOrBuffer: string | ArrayBuffer,
          options?: object
        ): Promise<{ inputNames: string[]; outputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> }>;
      };
      Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
    };
  }
}

const LOG = (msg: string) => console.log("[depth]", msg);
const LOG_ERR = (msg: string, err?: unknown) => {
  console.error("[depth]", msg, err ?? "");
};

function loadOrt(): Promise<NonNullable<Window["ort"]>> {
  if (typeof window === "undefined") return Promise.reject(new Error("Depth runs in browser only"));
  if (window.ort) return Promise.resolve(window.ort);
  return new Promise((resolve, reject) => {
    let tried = 0;
    const tryNext = () => {
      if (tried >= ORT_SCRIPT_URLS.length) {
        LOG_ERR("Failed to load ONNX Runtime from any CDN");
        reject(new Error("Failed to load ONNX Runtime from any CDN"));
        return;
      }
      LOG(`Loading ONNX Runtime from CDN (${tried + 1}/${ORT_SCRIPT_URLS.length})...`);
      const script = document.createElement("script");
      script.src = ORT_SCRIPT_URLS[tried];
      script.async = true;
      script.onload = () => {
        const check = () => {
          if (window.ort) {
            LOG("ONNX Runtime ready");
            resolve(window.ort);
          } else {
            LOG_ERR("ONNX Runtime script loaded but window.ort is missing");
            reject(new Error("ONNX Runtime script loaded but window.ort is missing"));
          }
        };
        setTimeout(check, 0);
      };
      script.onerror = () => {
        LOG_ERR(`CDN ${tried + 1} failed, trying next`);
        tried++;
        tryNext();
      };
      document.head.appendChild(script);
    };
    tryNext();
  });
}

/** Convert RGBA ImageData to NCHW Float32 (1, 3, H, W), values 0–1. */
function imageDataToNCHW(imageData: ImageData, width: number, height: number): Float32Array {
  const n = width * height * 3;
  const out = new Float32Array(n);
  const data = imageData.data;
  for (let i = 0; i < width * height; i++) {
    out[i] = data[i * 4] / 255;
    out[width * height + i] = data[i * 4 + 1] / 255;
    out[width * height * 2 + i] = data[i * 4 + 2] / 255;
  }
  return out;
}

function preprocess(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement,
  size: number
): Float32Array {
  ctx.drawImage(source, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  return imageDataToNCHW(imageData, size, size);
}

let sessionPromise: Promise<{ session: { inputNames: string[]; outputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>> }; ort: NonNullable<Window["ort"]> }> | null = null;

async function getSession() {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const ort = await loadOrt();
    LOG("Fetching model...");
    let modelRes: Response | null = null;
    for (const [name, url] of [
      ["local", DEPTH_MODEL_LOCAL],
      ["proxy", DEPTH_MODEL_PROXY],
      ["CDN", DEPTH_MODEL_CDN],
    ] as const) {
      try {
        modelRes = await fetch(url);
        if (modelRes.ok) {
          LOG(`Model loaded from ${name}`);
          break;
        }
        LOG(`${name} returned ${modelRes.status}`);
      } catch (e) {
        LOG_ERR(`${name} fetch threw`, e);
      }
    }
    if (!modelRes?.ok) {
      LOG_ERR("All model sources failed. Add the model to public/models/ (see public/models/README.md)");
      throw new Error("Model fetch failed. Add public/models/depthanything-quant.onnx (see public/models/README.md)");
    }
    const modelBuf = await modelRes.arrayBuffer();
    LOG(`Model size: ${(modelBuf.byteLength / 1024 / 1024).toFixed(2)} MB`);
    const options: { executionProviders: string[]; graphOptimizationLevel: string; externalData?: { path: string; data: ArrayBuffer }[] } = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    };
    try {
      const session = await ort.InferenceSession.create(modelBuf, options);
      LOG("Session created (no external data)");
      return { session, ort };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LOG_ERR("Session create failed", err);
      if (msg.includes("external data")) {
        LOG("Fetching external weights...");
        let dataRes: Response | null = null;
        for (const [name, url] of [
          ["local", DEPTH_MODEL_DATA_LOCAL],
          ["proxy", "/api/depth-model-data"],
          ["CDN", DEPTH_MODEL_DATA_CDN],
        ] as const) {
          try {
            dataRes = await fetch(url);
            if (dataRes.ok) {
              LOG(`External data loaded from ${name}`);
              break;
            }
            LOG(`External data ${name} returned ${dataRes.status}`);
          } catch (e) {
            LOG_ERR(`External data ${name} fetch threw`, e);
          }
        }
        if (!dataRes?.ok) {
          LOG_ERR("All external data sources failed");
          throw new Error("Model external weights unavailable. Add public/models/depthanything-quant.onnx_data if needed.");
        }
        const dataBuf = await dataRes.arrayBuffer();
        const pathVariants = ["depthanything-quant.onnx_data", "./depthanything-quant.onnx_data"];
        for (const path of pathVariants) {
          options.externalData = [{ path, data: dataBuf }];
          try {
            const session = await ort.InferenceSession.create(modelBuf, options);
            LOG(`Session created with external data (path: ${path})`);
            return { session, ort };
          } catch (e) {
            LOG_ERR(`External data path "${path}" failed`, e);
            continue;
          }
        }
        LOG_ERR("Could not load model with any external data path");
        throw new Error("Could not load model with external weights");
      }
      throw err;
    }
  })();
  return sessionPromise;
}

/**
 * Estimate depth from a room image URL. Returns depth map at DEPTH_INPUT_SIZE resolution.
 * Higher depth value = farther from camera (e.g. wall); lower = closer (e.g. furniture).
 */
export async function estimateDepth(imageUrl: string): Promise<DepthResult> {
  LOG("Estimating depth...");
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load image for depth"));
    el.src = imageUrl;
  });
  LOG("Image loaded, running inference...");

  const size = DEPTH_INPUT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2d context");

  const inputArr = preprocess(ctx, img, size);
  const { session, ort } = await getSession();
  const inputName = session.inputNames[0];
  const inputTensor = new ort.Tensor("float32", inputArr, [1, 3, size, size]);
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  const depthTensor = results[outputName];
  if (!depthTensor || !depthTensor.dims?.length) throw new Error("No depth output from model");

  const dims = depthTensor.dims;
  const depthH = dims[2];
  const depthW = dims[3];
  const raw = depthTensor.data;
  const len = depthH * depthW;
  const depthData = new Float32Array(len);
  if (raw instanceof Float32Array) {
    depthData.set(raw.subarray(0, len));
  } else if (raw && typeof (raw as { length: number }).length === "number") {
    const arr = raw as Float32Array;
    for (let i = 0; i < len; i++) depthData[i] = arr[i];
  } else {
    throw new Error("Depth output has no readable data");
  }

  LOG(`Depth map ready: ${depthW}x${depthH}`);
  return { depth: depthData, width: depthW, height: depthH };
}
