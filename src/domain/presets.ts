import { cloneSettings } from "./settings";
import type { LiquidGlassSettingsV1 } from "./types";

export const MATERIAL_PRESETS = [
  { id: "clear", name: "经典通透", description: "清晰折射 · 默认", overrides: {} },
  { id: "white", name: "白色玻璃", description: "适合深色文字", overrides: { ior: 1.5, blur: 12, displacementFactor: 0.45, specularStrength: 0.8, oppositeSpecularStrength: 0.8, tint: { r: 1, g: 1, b: 1, a: 0.5 } } },
  { id: "black", name: "黑色玻璃", description: "适合浅色文字", overrides: { ior: 1.5, blur: 12, displacementFactor: 0.45, specularStrength: 0.8, oppositeSpecularStrength: 0.8, tint: { r: 0.025, g: 0.035, b: 0.045, a: 0.5 } } },
  { id: "frost", name: "柔雾磨砂", description: "柔化复杂背景", overrides: { ior: 1.5, blur: 22, bezelWidth: 24, displacementFactor: 0.35, dispersion: 0.015, specularStrength: 0.65, oppositeSpecularStrength: 0.65, tint: { r: 1, g: 1, b: 1, a: 0.3 } } }
] satisfies Array<{ id: string; name: string; description: string; overrides: Partial<LiquidGlassSettingsV1> }>;

export function applyPreset(id: string, current: LiquidGlassSettingsV1): LiquidGlassSettingsV1 {
  const preset = MATERIAL_PRESETS.find((item) => item.id === id) ?? MATERIAL_PRESETS[0];
  return cloneSettings({ ...cloneSettings(), ...preset.overrides, shapeMode: current.shapeMode, outputScale: current.outputScale });
}
