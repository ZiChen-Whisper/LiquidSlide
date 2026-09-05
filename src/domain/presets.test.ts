import { describe, expect, it } from "vitest";
import { applyPreset, MATERIAL_PRESETS } from "./presets";
import { cloneSettings } from "./settings";

describe("material presets", () => {
  it("keeps geometry and output quality when switching materials", () => {
    const current = { ...cloneSettings(), shapeMode: "circle" as const, outputScale: 3 as const };
    for (const preset of MATERIAL_PRESETS) {
      const next = applyPreset(preset.id, current);
      expect(next.shapeMode).toBe("circle");
      expect(next.outputScale).toBe(3);
    }
  });
  it("restores the requested default after a readability preset", () => {
    expect(applyPreset("clear", applyPreset("black", cloneSettings()))).toEqual(cloneSettings());
  });
  it("does not mutate preset colors through returned settings", () => {
    const settings = applyPreset("white", cloneSettings());
    settings.tint.a = 0;
    expect(applyPreset("white", cloneSettings()).tint.a).toBe(0.5);
  });
});
