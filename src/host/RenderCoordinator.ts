import type { LiquidGlassSettingsV1, SelectedShapeInfo, RenderResult } from "../domain/types";
import type { HostAdapter } from "./ComHostAdapter";
import type { LiquidDomRenderer } from "../rendering/LiquidDomRenderer";

export function sameTarget(a: SelectedShapeInfo, b: SelectedShapeInfo) {
  return a.presentationId === b.presentationId && a.slideId === b.slideId && a.id === b.id;
}

/** One host/render transaction at a time. Only explicit apply requests write a fill. */
export class RenderCoordinator {
  busy = false;
  private cache?: { key: string; result: RenderResult };
  private lastApplied = "";
  constructor(private host: HostAdapter, private renderer: LiquidDomRenderer) {}

  async captureSource(current: () => boolean) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const { shape } = await this.host.inspectSelection();
      if (!current()) return null;
      const slideImageBase64 = await this.host.captureBackground(shape);
      if (!current()) return null;
      return { shape, slideImageBase64 };
    } finally { this.busy = false; }
  }

  async run(settings: LiquidGlassSettingsV1, write: boolean, current: () => boolean,
    target?: SelectedShapeInfo, force = false) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const { shape } = await this.host.inspectSelection();
      if (!current()) return null;
      if (target && !sameTarget(target, shape)) throw new Error("选区已切换，请重新应用。");
      const effective = { ...settings, shapeMode: shape.shapeMode ?? settings.shapeMode };
      const slideImageBase64 = await this.host.captureBackground(shape);
      if (!current()) return null;
      const key = JSON.stringify([shape, effective, slideImageBase64]);
      const result = this.cache?.key === key ? this.cache.result
        : await this.renderer.render({ shape, settings: effective, slideImageBase64 });
      if (!current()) return null;
      this.cache = { key, result };
      // Selection/geometry can change while awaiting the GPU. The host checks again at write time.
      const latest = await this.host.inspectSelection();
      if (!current() || JSON.stringify(latest.shape) !== JSON.stringify(shape)) return null;
      let applied = false;
      if (write && (force || this.lastApplied !== key)) {
        applied = await this.host.applyFill(shape, result.pngBase64, effective);
        if (!applied) return null;
        this.lastApplied = key;
      }
      return { shape, slideImageBase64, rendered: result, settings: effective, applied };
    } finally { this.busy = false; }
  }
}
