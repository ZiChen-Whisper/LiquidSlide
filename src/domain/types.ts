export type ShapeMode = "circle" | "roundedRectangle";
export type SurfaceProfile = "convex" | "concave" | "lip";

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface LiquidGlassSettingsV1 {
  schemaVersion: 1;
  shapeMode: ShapeMode;
  outputScale: 1 | 2 | 3;
  blur: number;
  bezelWidth: number;
  thickness: number;
  displacementFactor: number;
  displacementBlur: number;
  ior: number;
  dispersion: number;
  surfaceProfile: SurfaceProfile;
  lightDirection: number;
  specularStrength: number;
  specularWidth: number | "hairline";
  specularFalloff: number;
  oppositeSpecularStrength: number;
  specularSharpness: number;
  specularOpacity: number;
  reflectionOffset: number;
  tint: RgbaColor;
  opacity: number;
  normalDivergenceBlendEnabled: boolean;
  normalDivergenceBlendPower: number;
  debugDisplacement: boolean;
}

export interface SelectedShapeInfo {
  shapeMode?: ShapeMode;
  id: string;
  slideId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  adjustment: number | null;
  slideWidth: number;
  slideHeight: number;
}

export interface RenderRequest {
  slideImageBase64: string;
  shape: SelectedShapeInfo;
  settings: LiquidGlassSettingsV1;
}

export interface RenderResult {
  pngBase64: string;
  width: number;
  height: number;
  diagnostics: {
    adapter: string;
    renderMilliseconds: number;
    paddingCssPixels: number;
  };
}

export interface RuntimeCapabilities {
  officeReady: boolean;
  officeApiSupported: boolean;
  webGpuSupported: boolean;
  message: string;
}
