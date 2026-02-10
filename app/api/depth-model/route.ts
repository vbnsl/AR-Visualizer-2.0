import { NextResponse } from "next/server";

const DEPTH_MODEL_URL =
  "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanything-quant.onnx";
const FETCH_TIMEOUT_MS = 90_000;

/** Proxy the depth model so the browser can load it same-origin (avoids CORS). */
export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(DEPTH_MODEL_URL, {
      cache: "force-cache",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TileVisualizer/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[depth-model] proxy error:", msg, e);
    return NextResponse.json(
      { error: msg },
      { status: 502 }
    );
  }
}
