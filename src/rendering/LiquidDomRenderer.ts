import { Glass, Scene, WebGpuGlassCore } from "@liquid-dom/core";
import { createGlassContainer } from "./material";
import { calculatePaddingCssPixels, getCornerRadiusCssPixels, pointsToCssPixels } from "../domain/geometry";
import type { RenderRequest, RenderResult } from "../domain/types";
import { buildLocalBackdrop, canvasPngBase64, cropCenter, imageFromBase64 } from "./image";

export interface LiquidDomRenderer {
  render(request: RenderRequest): Promise<RenderResult>;
  destroy(): void;
}

function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

async function readTextureToCanvas(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const bytesPerRow = align(width * 4, 256);
  const buffer = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow, rowsPerImage: height }, { width, height });
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange());
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    pixels.set(mapped.subarray(row * bytesPerRow, row * bytesPerRow + width * 4), row * width * 4);
  }
  buffer.unmap();
  buffer.destroy();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建 WebGPU 输出画布。");
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

export class WebGpuLiquidDomRenderer implements LiquidDomRenderer {
  private device: GPUDevice | null = null;
  private core: WebGpuGlassCore | null = null;
  private renderQueue: Promise<void> = Promise.resolve();

  private async initialize(): Promise<void> {
    if (this.device && this.core) return;
    if (!navigator.gpu) throw new Error("当前 PowerPoint WebView2 未提供 WebGPU（navigator.gpu）。");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("没有找到可用的 WebGPU 图形适配器。");
    this.device = await adapter.requestDevice();
    this.core = new WebGpuGlassCore({ device: this.device, format: "rgba8unorm" });
  }

  async render(request: RenderRequest): Promise<RenderResult> {
    const task = this.renderQueue.then(() => this.renderInternal(request));
    this.renderQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async renderInternal(request: RenderRequest): Promise<RenderResult> {
    const started = performance.now();
    await this.initialize();
    const device = this.device!;
    const core = this.core!;
    const { shape, settings } = request;
    const padding = calculatePaddingCssPixels(settings);
    const scale = settings.outputScale;
    const shapeWidth = pointsToCssPixels(shape.width);
    const shapeHeight = pointsToCssPixels(shape.height);
    const logicalWidth = shapeWidth + padding * 2;
    const logicalHeight = shapeHeight + padding * 2;
    const pixelWidth = Math.max(1, Math.round(logicalWidth * scale));
    const pixelHeight = Math.max(1, Math.round(logicalHeight * scale));

    const slideBitmap = await imageFromBase64(request.slideImageBase64);
    const localBackdrop = buildLocalBackdrop(
      slideBitmap,
      slideBitmap.width,
      slideBitmap.height,
      shape,
      padding,
      scale
    );
    slideBitmap.close();
    const backdropBitmap = await createImageBitmap(localBackdrop);
    const backdropTexture = device.createTexture({
      size: [pixelWidth, pixelHeight],
      format: "rgba8unorm",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });
    const outputTexture = device.createTexture({
      size: [pixelWidth, pixelHeight],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING
    });

    try {
      device.queue.copyExternalImageToTexture({ source: backdropBitmap }, { texture: backdropTexture }, [pixelWidth, pixelHeight]);
      const scene = new Scene();
      const container = createGlassContainer(settings);
      container.add(new Glass({
        x: padding,
        y: padding,
        width: shapeWidth,
        height: shapeHeight,
        cornerRadius: getCornerRadiusCssPixels(shape, settings.shapeMode),
        cornerSmoothing: 0
      }));
      scene.add(container);
      core.render({
        scene,
        // Core target dimensions are physical pixels; dpr scales scene geometry.
        width: pixelWidth,
        height: pixelHeight,
        dpr: scale,
        outputTexture,
        backdropTexture
      });
      await device.queue.onSubmittedWorkDone();
      const rendered = await readTextureToCanvas(device, outputTexture, pixelWidth, pixelHeight);
      const resultCanvas = cropCenter(rendered, pixelWidth, pixelHeight, padding, shapeWidth, shapeHeight, scale, localBackdrop);
      return {
        pngBase64: canvasPngBase64(resultCanvas),
        width: resultCanvas.width,
        height: resultCanvas.height,
        diagnostics: {
          adapter: adapterLabel(),
          renderMilliseconds: Math.round((performance.now() - started) * 10) / 10,
          paddingCssPixels: padding
        }
      };
    } finally {
      backdropBitmap.close();
      backdropTexture.destroy();
      outputTexture.destroy();
    }
  }

  destroy(): void {
    this.core?.destroy();
    this.device?.destroy();
    this.core = null;
    this.device = null;
  }
}

function adapterLabel(): string {
  return "WebGPU";
}
