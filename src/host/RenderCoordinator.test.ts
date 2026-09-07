import { describe, expect, it, vi } from "vitest";
import { RenderCoordinator } from "./RenderCoordinator";
import { cloneSettings } from "../domain/settings";
import type { SelectedShapeInfo, RenderResult } from "../domain/types";

const shape: SelectedShapeInfo = { presentationId: "doc-1", id: "4", slideId: "256", shapeMode: "circle",
  left: 20, top: 30, width: 100, height: 100, rotation: 0, adjustment: null, slideWidth: 960, slideHeight: 540 };
const frame: RenderResult = { pngBase64: "png", width: 200, height: 200,
  diagnostics: { adapter: "test", renderMilliseconds: 1, paddingCssPixels: 10 } };
function setup() {
  const host = { inspectSelection: vi.fn(async () => ({ shape: { ...shape }, savedSettings: null })),
    captureBackground: vi.fn(async () => "background"), applyFill: vi.fn(async () => true) };
  const renderer = { render: vi.fn(async () => frame), destroy: vi.fn() };
  return { host, renderer, coordinator: new RenderCoordinator(host, renderer) };
}

describe("render transactions", () => {
  it("never writes a preview and reuses an unchanged frame", async () => {
    const { coordinator, host, renderer } = setup();
    await coordinator.run(cloneSettings(), false, () => true);
    await coordinator.run(cloneSettings(), false, () => true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(host.applyFill).not.toHaveBeenCalled();
  });
  it("writes only when the scene changes, but explicit apply always writes", async () => {
    const { coordinator, host } = setup();
    await coordinator.run(cloneSettings(), true, () => true);
    await coordinator.run(cloneSettings(), true, () => true);
    expect(host.applyFill).toHaveBeenCalledTimes(1);
    host.captureBackground.mockResolvedValue("changed background");
    await coordinator.run(cloneSettings(), true, () => true);
    await coordinator.run(cloneSettings(), true, () => true, undefined, true);
    expect(host.applyFill).toHaveBeenCalledTimes(3);
  });
  it("discards an in-flight GPU result when stopped and serializes transactions", async () => {
    const { coordinator, host, renderer } = setup();
    let complete!: (value: RenderResult) => void;
    let current = true;
    renderer.render.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const running = coordinator.run(cloneSettings(), true, () => current);
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalled());
    expect(await coordinator.run(cloneSettings(), true, () => true)).toBeNull();
    current = false;
    complete(frame);
    expect(await running).toBeNull();
    expect(host.applyFill).not.toHaveBeenCalled();
    expect(coordinator.busy).toBe(false);
  });
  it("rejects another presentation with the same slide and shape ids", async () => {
    const { coordinator, host } = setup();
    await expect(coordinator.run(cloneSettings(), true, () => true, { ...shape, presentationId: "doc-2" })).rejects.toThrow("选区已切换");
    expect(host.captureBackground).not.toHaveBeenCalled();
  });
  it("discards a render if the shape moved while the GPU was working", async () => {
    const { coordinator, host, renderer } = setup();
    renderer.render.mockImplementation(async () => {
      host.inspectSelection.mockResolvedValue({ shape: { ...shape, left: 75 }, savedSettings: null });
      return frame;
    });
    expect(await coordinator.run(cloneSettings(), true, () => true)).toBeNull();
    expect(host.applyFill).not.toHaveBeenCalled();
  });
  it("releases the transaction after failure and retries failed writes", async () => {
    const { coordinator, host } = setup();
    host.applyFill.mockRejectedValueOnce(new Error("COM busy"));
    await expect(coordinator.run(cloneSettings(), true, () => true)).rejects.toThrow("COM busy");
    expect(coordinator.busy).toBe(false);
    await coordinator.run(cloneSettings(), true, () => true);
    expect(host.applyFill).toHaveBeenCalledTimes(2);
  });
});
