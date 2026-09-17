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
      { key: "blur", label: "背景模糊", description: "越大越朦胧；0 保留清晰背景，3 为轻微柔化", min: 0, max: 48, step: 1 },
      { key: "bezelWidth", label: "斜面宽度", description: "越大，边缘扭曲背景的区域越宽", min: 1, max: 64, step: 1 },
      { key: "thickness", label: "玻璃厚度", description: "越大，背景折射越明显，看起来越厚", min: 0, max: 200, step: 1 },
      { key: "displacementFactor", label: "位移倍率", description: "控制背景扭曲幅度；0 关闭位移，1 为标准强度", min: 0, max: 3, step: 0.05 },
      { key: "displacementBlur", label: "位移柔化", description: "让折射过渡更柔和，减轻边缘的生硬扭曲", min: 0, max: 32, step: 1 }
    ]
  },
  {
    title: "折射",
    parameters: [
      { key: "ior", label: "折射率", description: "越大，光线弯折越明显；接近 1 时折射较弱", min: 1.001, max: 2.5, step: 0.01 },
      { key: "dispersion", label: "色散", description: "在边缘产生彩色分光；0 无彩边，越大越明显", min: 0, max: 0.25, step: 0.005 }
    ]
  },
  {
    title: "高光与反射",
    parameters: [
      { key: "lightDirection", label: "光线方向", description: "光从哪个方向照来：0 为右侧，约 -1.57 为上方", min: -3.1416, max: 3.1416, step: 0.05 },
      { key: "specularStrength", label: "高光强度", description: "朝向光源一侧的亮边；越大越亮", min: 0, max: 4, step: 0.05 },
      { key: "specularFalloff", label: "高光衰减", description: "越大，亮边向玻璃内部消失得越快", min: 0, max: 4, step: 0.05 },
      { key: "oppositeSpecularStrength", label: "反向高光", description: "背向光源一侧的亮边；0 关闭这一侧高光", min: 0, max: 4, step: 0.05 },
      { key: "specularSharpness", label: "高光锐度", description: "越大，高光越集中、越锐利", min: 0.1, max: 8, step: 0.1 },
      { key: "specularOpacity", label: "高光透明度", description: "0 隐藏高光，1 完整显示高光", min: 0, max: 1, step: 0.01 },
      { key: "reflectionOffset", label: "反射偏移", description: "调整边缘映出的背景位置；负值让方向反转", min: -64, max: 64, step: 1 }
    ]
  },
  {
    title: "颜色与合成",
    parameters: [
      { key: "brightness", label: "整体亮度", description: "-100 最暗，0 原始亮度，100 最亮。应用时使用 PPT 图片亮度；此处预览为近似效果", min: -100, max: 100, step: 1 },
      { key: "opacity", label: "整体透明度", description: "0 显示原始背景，1 完整显示玻璃材质", min: 0, max: 1, step: 0.01 }
    ]
  },
  {
    title: "高级",
    parameters: [
      { key: "normalDivergenceBlendPower", label: "法线门控强度", description: "控制尖角和凹陷处的高光抑制程度；通常保持 1", min: 0, max: 8, step: 0.1 }
    ]
  }
];
