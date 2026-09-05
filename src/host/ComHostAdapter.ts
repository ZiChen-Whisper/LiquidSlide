import type { LiquidGlassSettingsV1, SelectedShapeInfo } from "../domain/types";

interface WebViewMessage {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
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
  captureBackground(shapeId: string, slideId: string): Promise<string>;
  applyFill(shapeId: string, pngBase64: string, settings: LiquidGlassSettingsV1, slideId: string): Promise<void>;
}

export class ComHostAdapter implements HostAdapter {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

  constructor() {
    const bridge = window.chrome?.webview;
    if (!bridge) return;
    bridge.addEventListener("message", (event) => {
      const message = event.data;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.ok) request.resolve(message.result);
      else request.reject(new Error(message.error || "PowerPoint COM 操作失败。"));
    });
  }

  async applyShadow(shapeId: string, slideId: string) {
    await this.request("applyShadow", { shapeId, slideId });
  }

  get available(): boolean { return Boolean(window.chrome?.webview); }

  private request<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
    const bridge = window.chrome?.webview;
    if (!bridge) return Promise.reject(new Error("LiquidSlide 必须在 PowerPoint COM 工具窗口中运行。"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      bridge.postMessage({ id, type, payload });
    });
  }

  inspectSelection() {
    return this.request<{ shape: SelectedShapeInfo; savedSettings: LiquidGlassSettingsV1 | null }>("inspectSelection");
  }

  captureBackground(shapeId: string, slideId: string) {
    return this.request<string>("captureBackground", { shapeId, slideId });
  }

  async applyFill(shapeId: string, pngBase64: string, settings: LiquidGlassSettingsV1, slideId: string) {
    await this.request("applyFill", { shapeId, pngBase64, settings, slideId });
  }
}
