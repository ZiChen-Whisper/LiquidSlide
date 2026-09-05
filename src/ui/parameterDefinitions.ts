import type { LiquidGlassSettingsV1 } from "../domain/types";

export type NumericSettingKey = {
  [K in keyof LiquidGlassSettingsV1]: LiquidGlassSettingsV1[K] extends number ? K : never
}[keyof LiquidGlassSettingsV1];

export interface NumericParameter {
  key: NumericSettingKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}

export const PARAMETER_GROUPS: Array<{ title: string; parameters: NumericParameter[] }> = [
  {
    title: "模糊与位移",
    parameters: [
      { key: "blur", label: "背景模糊", description: "玻璃内部的背景模糊半径", min: 0, max: 48, step: 1 },
      { key: "bezelWidth", label: "斜面宽度", description: "参与折射的玻璃边缘宽度", min: 1, max: 64, step: 1 },
      { key: "thickness", label: "玻璃厚度", description: "折射模型中的虚拟玻璃厚度", min: 0, max: 200, step: 1 },
      { key: "displacementFactor", label: "位移倍率", description: "物理折射位移的整体倍率", min: 0, max: 3, step: 0.05 },
      { key: "displacementBlur", label: "位移柔化", description: "位移场的模糊半径", min: 0, max: 32, step: 1 }
    ]
  },
  {
    title: "折射",
    parameters: [
      { key: "ior", label: "折射率", description: "玻璃介质的折射率", min: 1.001, max: 2.5, step: 0.01 },
      { key: "dispersion", label: "色散", description: "红绿蓝通道的折射分离强度", min: 0, max: 0.25, step: 0.005 }
    ]
  },
  {
    title: "高光与反射",
    parameters: [
      { key: "lightDirection", label: "光线方向", description: "高光方向，单位为弧度", min: -3.1416, max: 3.1416, step: 0.05 },
      { key: "specularStrength", label: "高光强度", description: "主高光强度", min: 0, max: 4, step: 0.05 },
      { key: "specularFalloff", label: "高光衰减", description: "高光从边缘向内的衰减量", min: 0, max: 4, step: 0.05 },
      { key: "oppositeSpecularStrength", label: "反向高光", description: "光线相对一侧的高光强度", min: 0, max: 4, step: 0.05 },
      { key: "specularSharpness", label: "高光锐度", description: "高光衰减曲线的指数", min: 0.1, max: 8, step: 0.1 },
      { key: "specularOpacity", label: "高光透明度", description: "白色高光的最终透明度", min: 0, max: 1, step: 0.01 },
      { key: "reflectionOffset", label: "反射偏移", description: "边缘反射的采样距离", min: -64, max: 64, step: 1 }
    ]
  },
  {
    title: "颜色与合成",
    parameters: [
      { key: "opacity", label: "整体透明度", description: "玻璃图层的最终透明度", min: 0, max: 1, step: 0.01 }
    ]
  },
  {
    title: "高级",
    parameters: [
      { key: "normalDivergenceBlendPower", label: "法线门控强度", description: "抑制边界法线分歧处融合的指数", min: 0, max: 8, step: 0.1 }
    ]
  }
];
