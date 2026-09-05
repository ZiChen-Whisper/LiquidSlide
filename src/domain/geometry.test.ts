import { describe, expect, it } from "vitest";
import { calculatePaddingCssPixels, getCornerRadiusCssPixels, isCircle, pointsToCssPixels } from "./geometry";
import type { SelectedShapeInfo } from "./types";

const shape: SelectedShapeInfo = {
  id: "shape", slideId: "slide", left: 10, top: 10, width: 100, height: 100,
  rotation: 0, adjustment: 0.2, slideWidth: 960, slideHeight: 540
};

describe("geometry", () => {
  it("converts PowerPoint points to CSS pixels", () => {
    expect(pointsToCssPixels(72)).toBe(96);
  });

  it("accepts only near-equal dimensions as a circle", () => {
    expect(isCircle(100, 100.9)).toBe(true);
    expect(isCircle(100, 102)).toBe(false);
  });

  it("maps a circle to half its CSS diameter", () => {
    expect(getCornerRadiusCssPixels(shape, "circle")).toBeCloseTo(66.6667, 3);
  });

  it("keeps enough sampling padding for large effects", () => {
    expect(calculatePaddingCssPixels({ blur: 20, bezelWidth: 14, displacementBlur: 8, reflectionOffset: 18, thickness: 90 })).toBeGreaterThanOrEqual(40);
  });
});
