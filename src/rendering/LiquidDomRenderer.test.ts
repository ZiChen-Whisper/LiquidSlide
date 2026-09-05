import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneSettings } from "../domain/settings";
import { WebGpuLiquidDomRenderer } from "./LiquidDomRenderer";

const { renderCore } = vi.hoisted(() => ({ renderCore: vi.fn() }));
vi.mock("@liquid-dom/core", () => ({
  WebGpuGlassCore: class { render = renderCore; },
  Scene: class { add() {} },
  Container: class { add() {} },
  Glass: class {}
}));
vi.mock("./image", () => ({
  imageFromBase64: async () => ({ width: 2560, height: 1440, close() {} }),
  buildLocalBackdrop: () => ({}),
  cropCenter: () => ({ width: 400, height: 200 }),
  canvasPngBase64: () => "png"
}));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("WebGPU output coordinate contract", () => {
  it.each([1, 2, 3] as const)("uses physical target dimensions at %sx", async (outputScale) => {
    const createTexture = vi.fn((descriptor) => ({ ...descriptor, destroy() {} }));
    const device = {
      createTexture,
      createBuffer: ({ size }: { size: number }) => ({
        mapAsync: async () => {}, getMappedRange: () => new ArrayBuffer(size), unmap() {}, destroy() {}
      }),
      createCommandEncoder: () => ({ copyTextureToBuffer() {}, finish() {} }),
      queue: { copyExternalImageToTexture() {}, submit() {}, onSubmittedWorkDone: async () => {} }
    };
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) } });
    vi.stubGlobal("GPUTextureUsage", { COPY_DST: 1, TEXTURE_BINDING: 2, RENDER_ATTACHMENT: 4, COPY_SRC: 8 });
    vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, MAP_READ: 2 });
    vi.stubGlobal("GPUMapMode", { READ: 1 });
    vi.stubGlobal("createImageBitmap", async () => ({ close() {} }));
    vi.stubGlobal("ImageData", class {});
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ putImageData() {} }) }) });
    await new WebGpuLiquidDomRenderer().render({
      slideImageBase64: "background", settings: { ...cloneSettings(), outputScale },
      shape: { id: "1", slideId: "1", left: 37, top: 29, width: 315.75, height: 152.625,
        rotation: 0, adjustment: 0.2, slideWidth: 960, slideHeight: 540 }
    });
    const options = renderCore.mock.calls[0][0];
    expect([options.width, options.height]).toEqual(options.outputTexture.size);
    expect([options.width, options.height]).toEqual(options.backdropTexture.size);
    expect(options.dpr).toBe(outputScale);
  });
});
