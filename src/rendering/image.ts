import { pointsToCssPixels } from "../domain/geometry";
import type { SelectedShapeInfo } from "../domain/types";

export async function imageFromBase64(base64: string): Promise<ImageBitmap> {
  const normalized = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return createImageBitmap(new Blob([bytes], { type: "image/png" }));
}

export function buildLocalBackdrop(
  slide: CanvasImageSource,
  slidePixelWidth: number,
  slidePixelHeight: number,
  shape: SelectedShapeInfo,
  paddingCssPixels: number,
  outputScale: number
): HTMLCanvasElement {
  const shapeWidth = pointsToCssPixels(shape.width);
  const shapeHeight = pointsToCssPixels(shape.height);
  const logicalWidth = shapeWidth + paddingCssPixels * 2;
  const logicalHeight = shapeHeight + paddingCssPixels * 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(logicalWidth * outputScale));
  canvas.height = Math.max(1, Math.round(logicalHeight * outputScale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("无法创建背景裁剪画布。");

  const slideCssWidth = pointsToCssPixels(shape.slideWidth);
  const slideCssHeight = pointsToCssPixels(shape.slideHeight);
  const sourceScaleX = slidePixelWidth / slideCssWidth;
  const sourceScaleY = slidePixelHeight / slideCssHeight;
  const centerX = pointsToCssPixels(shape.left + shape.width / 2);
  const centerY = pointsToCssPixels(shape.top + shape.height / 2);
  const rotationRadians = (shape.rotation * Math.PI) / 180;

  context.save();
  context.scale(outputScale, outputScale);
  context.translate(logicalWidth / 2, logicalHeight / 2);
  context.rotate(-rotationRadians);
  context.translate(-centerX, -centerY);
  context.scale(1 / sourceScaleX, 1 / sourceScaleY);
  context.drawImage(slide, 0, 0);
  context.restore();
  return canvas;
}

export function cropCenter(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  paddingCssPixels: number,
  targetWidthCssPixels: number,
  targetHeightCssPixels: number,
  outputScale: number,
  fallbackBackdrop?: CanvasImageSource
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidthCssPixels * outputScale));
  canvas.height = Math.max(1, Math.round(targetHeightCssPixels * outputScale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建输出画布。");
  const start = Math.round(paddingCssPixels * outputScale);
  // PowerPoint applies the final shape mask. Keep the sampled slide background
  // under transparent glass pixels so small radius differences never expose an
  // old fill or a rectangular transparent corner.
  if (fallbackBackdrop) {
    context.drawImage(fallbackBackdrop, start, start, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source, start, start, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  void sourceWidth;
  void sourceHeight;
  return canvas;
}

export function canvasPngBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
