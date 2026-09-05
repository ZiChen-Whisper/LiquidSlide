import type { SelectedShapeInfo } from "./types";

export function previewBounds(shape: SelectedShapeInfo) {
  const angle = shape.rotation * Math.PI / 180;
  const width = Math.abs(Math.cos(angle)) * shape.width + Math.abs(Math.sin(angle)) * shape.height;
  const height = Math.abs(Math.sin(angle)) * shape.width + Math.abs(Math.cos(angle)) * shape.height;
  const margin = Math.max(width, height) * 0.18;
  let viewWidth = width + margin * 2;
  let viewHeight = height + margin * 2;
  const aspect = 1.52;
  if (viewWidth / viewHeight < aspect) viewWidth = viewHeight * aspect;
  else viewHeight = viewWidth / aspect;
  viewWidth = Math.min(viewWidth, shape.slideWidth);
  viewHeight = Math.min(viewHeight, shape.slideHeight);
  return {
    left: Math.max(0, Math.min(shape.left + shape.width / 2 - viewWidth / 2, shape.slideWidth - viewWidth)),
    top: Math.max(0, Math.min(shape.top + shape.height / 2 - viewHeight / 2, shape.slideHeight - viewHeight)),
    width: viewWidth, height: viewHeight
  };
}
