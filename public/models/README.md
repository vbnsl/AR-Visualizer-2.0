# Depth model (optional)

To use **depth-based occlusion** (tiles hidden behind furniture by depth), the app needs the Depth Anything ONNX model (~26 MB). If the model is missing, you’ll see: **"Model fetch failed. Add public/models/depthanything-quant.onnx"**.

Without the depth model, the app still uses **wall detection (DeepLab)** or **edge-based occlusion** when available.

## One-time setup

From the project root, run:

```bash
cd public/models
curl -L -o depthanything-quant.onnx "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanything-quant.onnx"
curl -L -o depthanything-quant.onnx_data "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanything-quant.onnx_data"
```

Or run the script (from project root):

```bash
./scripts/download-depth-model.sh
```

Then refresh the app. The app loads from `/models/` (same-origin, no CORS).

## Files

| File | Purpose |
|------|--------|
| `depthanything-quant.onnx` | Required. Main model. |
| `depthanything-quant.onnx_data` | Optional. External weights (download if the app asks for it). |
