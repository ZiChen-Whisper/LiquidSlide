import { Container } from "@liquid-dom/core";
import type { LiquidGlassSettingsV1 } from "../domain/types";

/** The same optical parameters power the PowerPoint fill and the plugin UI. */
export function createGlassContainer(settings: LiquidGlassSettingsV1): Container {
  return new Container({
    opacity: settings.opacity,
    blur: settings.blur,
    bezelWidth: settings.bezelWidth,
    thickness: settings.thickness,
    displacementFactor: settings.displacementFactor,
    displacementBlur: settings.displacementBlur,
    normalDivergenceBlendEnabled: settings.normalDivergenceBlendEnabled,
    normalDivergenceBlendPower: settings.normalDivergenceBlendPower,
    ior: settings.ior,
    dispersion: settings.dispersion,
    surfaceProfile: settings.surfaceProfile,
    lightDirection: settings.lightDirection,
    specularStrength: settings.specularStrength,
    specularWidth: settings.specularWidth,
    specularFalloff: settings.specularFalloff,
    oppositeSpecularStrength: settings.oppositeSpecularStrength,
    specularSharpness: settings.specularSharpness,
    specularOpacity: settings.specularOpacity,
    reflectionOffset: settings.reflectionOffset,
    tint: settings.tint,
    debugDisplacement: settings.debugDisplacement
  });
}
