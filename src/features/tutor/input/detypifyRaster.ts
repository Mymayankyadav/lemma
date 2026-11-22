import { inkBounds } from "./inkGeometry";
import { MODEL_INPUT_SIZE, MODEL_MANIFEST } from "./modelAssets";
import type { InkStroke } from "./types";

export type InkRasterizer = (strokes: readonly InkStroke[]) => Float32Array<ArrayBuffer> | undefined;

// Adapted from Detypify (c) 2024 QuarticCat, MIT. See the shipped asset set's Detypify-LICENSE.txt.
export function createInkRasterizer(canvas: OffscreenCanvas | HTMLCanvasElement): InkRasterizer | undefined {
  const size = MODEL_INPUT_SIZE;
  const { paddingPx, strokeWidthPx, pixelOffset } = MODEL_MANIFEST.preprocessing;
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  return strokes => {
    const bounds = inkBounds(strokes);
    if (!bounds) return;
    const extent = Math.max(bounds.width, bounds.height);
    // Detypify has no reliable output for an empty drawing or a lone dot.
    if (extent <= 1e-6) return;
    const scale = (size - 2 * paddingPx) / extent;
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;

    context.resetTransform();
    context.fillStyle = "black";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "white";
    context.lineWidth = strokeWidthPx;
    context.lineCap = "round";
    // Canvas coordinates lie on pixel edges. This follows the model's OpenCV pixel centers.
    context.translate(pixelOffset, pixelOffset);
    for (const stroke of strokes) {
      context.beginPath();
      for (const { x, y } of stroke.points) {
        context.lineTo(Math.round((x - centerX) * scale + size / 2), Math.round((y - centerY) * scale + size / 2));
      }
      context.stroke();
    }

    const rgba = context.getImageData(0, 0, size, size).data;
    const grayscale = new Float32Array(size * size);
    let hasInk = false;
    for (let index = 0; index < grayscale.length; index++) {
      const red = rgba[index * 4];
      if (red) hasInk = true;
      grayscale[index] = red / 255;
    }
    if (hasInk) return grayscale;
  };
}
