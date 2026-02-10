#!/usr/bin/env bash
# Download Depth Anything ONNX model into public/models/ (see public/models/README.md).
set -e
cd "$(dirname "$0")/.."
mkdir -p public/models
cd public/models
BASE="https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33"
echo "Downloading depth model..."
curl -L -o depthanything-quant.onnx "${BASE}/depthanything-quant.onnx"
echo "Downloading external weights (optional)..."
curl -L -o depthanything-quant.onnx_data "${BASE}/depthanything-quant.onnx_data"
echo "Done. Restart or refresh the app."
