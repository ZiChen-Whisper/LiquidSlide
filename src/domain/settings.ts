import type { LiquidGlassSettingsV1 } from "./types";

export const LIQUIDSLIDE_TAG_PREFIX = "LIQUIDSLIDE_SETTINGS_V1_";
export const LIQUIDSLIDE_TAG_CHUNK_SIZE = 220;

export const DEFAULT_SETTINGS: LiquidGlassSettingsV1 = {
  schemaVersion: 1,
  shapeMode: "roundedRectangle",
  outputScale: 2,
  blur: 3,
  bezelWidth: 36,
  thickness: 90,
  displacementFactor: 1,
  displacementBlur: 6,
  ior: 1.5,
  dispersion: 0.05,
  surfaceProfile: "convex",
  lightDirection: -Math.PI / 4,
  specularStrength: 1.5,
  specularWidth: 1,
  specularFalloff: 1,
  oppositeSpecularStrength: 1.5,
  specularSharpness: 3,
  specularOpacity: 0.5,
  reflectionOffset: 18,
  tint: { r: 1, g: 1, b: 1, a: 0.1 },
  opacity: 1,
  normalDivergenceBlendEnabled: true,
  normalDivergenceBlendPower: 1,
  debugDisplacement: false
};

export function cloneSettings(settings = DEFAULT_SETTINGS): LiquidGlassSettingsV1 {
  return { ...settings, tint: { ...settings.tint } };
}

export function normalizeSettings(value: unknown): LiquidGlassSettingsV1 {
  if (!value || typeof value !== "object") return cloneSettings();
  const candidate = value as Partial<LiquidGlassSettingsV1>;
  if (candidate.schemaVersion !== 1) return cloneSettings();
  return {
    ...cloneSettings(),
    ...candidate,
    schemaVersion: 1,
    tint: { ...DEFAULT_SETTINGS.tint, ...(candidate.tint ?? {}) }
  };
}

export function serializeSettings(settings: LiquidGlassSettingsV1): string {
  return JSON.stringify(settings);
}

export function deserializeSettings(value: string): LiquidGlassSettingsV1 {
  try {
    return normalizeSettings(JSON.parse(value));
  } catch {
    return cloneSettings();
  }
}

export function splitSettingsTags(settings: LiquidGlassSettingsV1): Array<{ key: string; value: string }> {
  const serialized = serializeSettings(settings);
  const chunks: Array<{ key: string; value: string }> = [];
  for (let offset = 0, index = 0; offset < serialized.length; offset += LIQUIDSLIDE_TAG_CHUNK_SIZE, index += 1) {
    chunks.push({ key: `${LIQUIDSLIDE_TAG_PREFIX}${String(index).padStart(2, "0")}`, value: serialized.slice(offset, offset + LIQUIDSLIDE_TAG_CHUNK_SIZE) });
  }
  return chunks;
}

export function joinSettingsTags(tags: Array<{ key: string; value: string }>): LiquidGlassSettingsV1 | null {
  const chunks = tags
    .filter((tag) => tag.key.toUpperCase().startsWith(LIQUIDSLIDE_TAG_PREFIX))
    .sort((left, right) => left.key.localeCompare(right.key));
  return chunks.length ? deserializeSettings(chunks.map((chunk) => chunk.value).join("")) : null;
}
