import type { SelectedShapeInfo, ShapeMode } from "./types";

export const POINTS_TO_CSS_PIXELS = 96 / 72;

export function pointsToCssPixels(points: number): number {
  return points * POINTS_TO_CSS_PIXELS;
}

export function isCircle(width: number, height: number, tolerance = 0.01): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width - height) / Math.max(width, height) <= tolerance;
}

export function validateShape(shape: SelectedShapeInfo, mode: ShapeMode): void {
  if (shape.width <= 0 || shape.height <= 0) throw new Error("选中图形的尺寸无效。");
  if (mode === "circle" && !isCircle(shape.width, shape.height)) {
    throw new Error("圆形模式要求图形宽高误差不超过 1%。请先在 PowerPoint 中设为正圆。");
  }
}

export function getCornerRadiusCssPixels(shape: SelectedShapeInfo, mode: ShapeMode): number {
  const shortest = pointsToCssPixels(Math.min(shape.width, shape.height));
  if (mode === "circle") return shortest / 2;
  // PowerPoint adjustment values are normalized. The final image fill remains
  // clipped by PowerPoint, so this value controls only the optical edge profile.
  const adjustment = shape.adjustment == null ? 0.16667 : Math.min(Math.max(shape.adjustment, 0), 0.5);
  return shortest * adjustment;
}

export function calculatePaddingCssPixels(settings: {
  blur: number;
  bezelWidth: number;
  displacementBlur: number;
  reflectionOffset: number;
  thickness: number;
}): number {
  const opticalReach = Math.max(
    settings.blur * 2,
    settings.bezelWidth + settings.displacementBlur * 2,
    Math.abs(settings.reflectionOffset) + settings.bezelWidth,
    settings.thickness * 0.35
  );
  return Math.ceil(Math.max(24, opticalReach));
}
