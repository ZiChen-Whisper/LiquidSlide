import type { LiquidGlassSettingsV1, SelectedShapeInfo } from "../domain/types";

interface WebViewMessage {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  type?: string;
  preset?: string;
  shape?: SelectedShapeInfo;
  commandId?: string;
}

interface WebViewBridge {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WebViewMessage>) => void): void;
}

declare global {
  interface Window { chrome?: { webview?: WebViewBridge } }
}

export interface HostAdapter {
  inspectSelection(): Promise<{ shape: SelectedShapeInfo; savedSettings: LiquidGlassSettingsV1 | null }>;
  captureBackground(shape: SelectedShapeInfo): Promise<string>;
  applyFill(shape: SelectedShapeInfo, pngBase64: string, settings: LiquidGlassSettingsV1): Promise<boolean>;
}

export class ComHostAdapter implements HostAdapter {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  commandId?: string;
  onPreset?: (preset: string, shape: SelectedShapeInfo, commandId?: string) => void;
  onCancelCommand?: () => void;
  onHidden?: () => void;
  onShown?: () => void;
  onSelectionChanged?: () => void;

  constructor() {
    const bridge = window.chrome?.webview;
    if (!bridge) return;
    bridge.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "preset" && message.preset && message.shape) { this.onPreset?.(message.preset, message.shape, message.commandId); return; }
      if (message.type === "cancelCommand") { this.onCancelCommand?.(); return; }
      if (message.type === "hidden" || message.type === "shown") {
        document.dispatchEvent(new CustomEvent("liquidslide-pane-visibility", { detail: message.type === "shown" }));
        if (message.type === "hidden") this.onHidden?.();
        else this.onShown?.();
        return;
      }
      if (message.type === "selectionChanged") { this.onSelectionChanged?.(); return; }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.ok) request.resolve(message.result);
      else request.reject(new Error(message.error || "PowerPoint COM 操作失败。"));
    });
  }

  async applyShadow(shape: SelectedShapeInfo) {
    await this.request("applyShadow", this.target(shape));
  }

  async removeOutline(shape: SelectedShapeInfo) { await this.request("removeOutline", this.target(shape)); }
  async showAbout() { await this.request("showAbout"); }
  async ready() { await this.request("ready"); }
  async watchSelection(enabled: boolean) { await this.request("watchSelection", { enabled }); }
  async commandFinished(error?: string, commandId = this.commandId) { await this.request("commandFinished", { error }, commandId); }
  private target(shape: SelectedShapeInfo) { return { shapeId: shape.id, slideId: shape.slideId, expectedShape: shape }; }

  get available(): boolean { return Boolean(window.chrome?.webview); }

  private request<T>(type: string, payload: Record<string, unknown> = {}, commandId = this.commandId): Promise<T> {
    const bridge = window.chrome?.webview;
    if (!bridge) return Promise.reject(new Error("LiquidSlide 必须在 PowerPoint COM 工具窗口中运行。"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => { this.pending.delete(id); reject(new Error("PowerPoint 响应超时，请重新打开面板。")); }, 30000);
      this.pending.set(id, {
        resolve: (value) => { window.clearTimeout(timeout); resolve(value as T); },
        reject: (reason) => { window.clearTimeout(timeout); reject(reason); }
      });
      try { bridge.postMessage({ id, type, payload, commandId }); }
      catch (error) { window.clearTimeout(timeout); this.pending.delete(id); reject(error); }
    });
  }

  inspectSelection() {
    return this.request<{ shape: SelectedShapeInfo; savedSettings: LiquidGlassSettingsV1 | null }>("inspectSelection");
  }

  captureBackground(shape: SelectedShapeInfo) {
    return this.request<string>("captureBackground", this.target(shape));
  }

  async applyFill(shape: SelectedShapeInfo, pngBase64: string, settings: LiquidGlassSettingsV1) {
    const result = await this.request<{ applied: boolean }>("applyFill", { ...this.target(shape), pngBase64, settings });
    return result.applied;
  }
}
