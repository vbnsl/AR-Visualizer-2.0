import { NextResponse } from "next/server";

const DEPTH_MODEL_DATA_URL =
  "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanything-quant.onnx_data";

/** Proxy the depth model external weights so the browser can load them same-origin. */
export async function GET() {
  try {
    const res = await fetch(DEPTH_MODEL_DATA_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`External data fetch failed: ${res.status}`);
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("Depth model data proxy error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load model data" },
      { status: 502 }
    );
  }
}
