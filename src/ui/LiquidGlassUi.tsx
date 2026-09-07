import { useEffect, useRef } from "react";
import { Glass, Scene, WebGpuGlassCore } from "@liquid-dom/core";
import { applyPreset } from "../domain/presets";
import { cloneSettings } from "../domain/settings";
import { createGlassContainer } from "../rendering/material";

type Material = "white" | "white-selected" | "accent";
interface Surface {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  rect: DOMRect;
  radius: number;
  material: Material;
  overPreview: boolean;
}

function drawOrbs(context: CanvasRenderingContext2D, width: number, height: number, seconds: number) {
  context.fillStyle = "#f8f9ff";
  context.fillRect(0, 0, width, height);
  const orbs = [
    { x: .05, y: .22, r: .32, color: "#ccd9ff", speed: .09 },
    { x: .93, y: .49, r: .36, color: "#dbcef7", speed: .07 }
  ];
  orbs.forEach((orb, index) => {
    const x = width * (orb.x + .06 * Math.sin(seconds * orb.speed + index));
    const y = height * orb.y + 22 * Math.cos(seconds * orb.speed * .8 + index);
    const radius = Math.min(width, 480) * orb.r;
    const gradient = context.createRadialGradient(x - radius * .3, y - radius * .35, 0, x, y, radius);
    gradient.addColorStop(0, "#f0eeff");
    gradient.addColorStop(.55, orb.color);
    gradient.addColorStop(1, orb.color);
    context.fillStyle = gradient;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  });
}

/** A single GPU compositor supplies all UI glass surfaces. No PNG encoding/readback per frame. */
export function LiquidGlassUi({ paused }: { paused: boolean }) {
  const backgroundRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const background = backgroundRef.current!;
    const backgroundContext = background.getContext("2d");
    if (!backgroundContext) return;
    let disposed = false;
    let request = 0;
    let dirty = true;
    let paneVisible = true;
    let framesInFlight = 0;
    let overlayDirty = true;
    let overlayGeometry = "";
    let device: GPUDevice | undefined;
    let core: WebGpuGlassCore | undefined;
    let texture: GPUTexture | undefined;
    const output = document.createElement("canvas");
    let gpuContext: GPUCanvasContext | null = null;
    const composite = document.createElement("canvas");
    const compositeContext = composite.getContext("2d")!;
    const surfaces = new Map<HTMLElement, Surface>();
    const canvasStyleCache = new WeakMap<HTMLCanvasElement, string>();
    const images = new Map<string, HTMLImageElement>();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationOrigin = performance.now();
    const invalidate = () => { dirty = true; overlayDirty = true; };
    const interact = invalidate;
    const pointerMove = (event: PointerEvent) => { if (event.buttons) interact(); };
    const visibilityChanged = () => {
      animationOrigin = performance.now();
      invalidate();
    };
    const paneVisibilityChanged = (event: Event) => {
      paneVisible = Boolean((event as CustomEvent<boolean>).detail);
      visibilityChanged();
    };
    const observer = new MutationObserver((records) => {
      // Our own canvas attachment is not a new layout change.
      if (records.some(record => record.type === "attributes" ? !(record.target instanceof HTMLCanvasElement) :
        [...record.addedNodes, ...record.removedNodes].some(node => !(node instanceof HTMLCanvasElement)))) interact();
    });
    observer.observe(document.querySelector("main")!, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "style", "open", "src", "disabled", "data-liquid-glass"]
    });
    window.addEventListener("resize", invalidate);
    window.addEventListener("scroll", interact, true);
    window.addEventListener("wheel", interact, { passive: true });
    window.addEventListener("pointerdown", interact, { passive: true });
    window.addEventListener("pointermove", pointerMove, { passive: true });
    window.addEventListener("pointerup", interact, { passive: true });
    document.addEventListener("visibilitychange", visibilityChanged);
    document.addEventListener("load", invalidate, true);
    document.addEventListener("liquidslide-pane-visibility", paneVisibilityChanged);
    reducedMotion.addEventListener("change", invalidate);

    function collectSurfaces(): Surface[] {
      const found = new Set(document.querySelectorAll<HTMLElement>("[data-liquid-glass]"));
      for (const [element, surface] of surfaces) {
        if (!found.has(element)) {
          surface.canvas.remove();
          element.removeAttribute("data-liquid-ready");
          surfaces.delete(element);
        }
      }
      const visible: Surface[] = [];
      for (const element of found) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
        let surface = surfaces.get(element);
        if (!surface) {
          const canvas = document.createElement("canvas");
          canvas.className = "liquid-surface-canvas";
          canvas.setAttribute("aria-hidden", "true");
          const context = canvas.getContext("2d");
          if (!context) continue;
          element.appendChild(canvas);
          surface = { element, canvas, context, rect, radius: 0, material: "white", overPreview: false };
          surfaces.set(element, surface);
        }
        // React may replace a text-only element's children when its label changes.
        if (surface.canvas.parentElement !== element) element.appendChild(surface.canvas);
        surface.rect = rect;
        const style = getComputedStyle(element);
        surface.radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.width / 2, rect.height / 2);
        // Absolute children start at the padding edge, while the GPU uses the border box.
        // Match that box exactly instead of shifting/stretching the optical highlight.
        const canvasStyle = `left:${-parseFloat(style.borderLeftWidth) || 0}px;top:${-parseFloat(style.borderTopWidth) || 0}px;width:${rect.width}px;height:${rect.height}px`;
        if (canvasStyleCache.get(surface.canvas) !== canvasStyle) {
          surface.canvas.style.cssText = canvasStyle;
          canvasStyleCache.set(surface.canvas, canvasStyle);
        }
        surface.material = element.dataset.liquidGlass as Material;
        surface.overPreview = element.dataset.glassOverPreview === "true";
        const width = Math.max(1, Math.ceil(rect.width));
        const height = Math.max(1, Math.ceil(rect.height));
        if (surface.canvas.width !== width) surface.canvas.width = width;
        if (surface.canvas.height !== height) surface.canvas.height = height;
        visible.push(surface);
      }
      return visible;
    }

    function drawPreviewBackdrop() {
      compositeContext.drawImage(background, 0, 0);
      const preview = document.querySelector<HTMLElement>(".preview");
      if (!preview) return;
      const rect = preview.getBoundingClientRect();
      const style = getComputedStyle(preview);
      const url = style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      compositeContext.save();
      compositeContext.beginPath();
      compositeContext.roundRect(rect.left, rect.top, rect.width, rect.height, parseFloat(style.borderTopLeftRadius) || 0);
      compositeContext.clip();
      compositeContext.fillStyle = style.backgroundColor;
      compositeContext.fillRect(rect.left, rect.top, rect.width, rect.height);
      if (url) {
        let image = images.get(url);
        if (!image) {
          // Only the current preview background is needed; do not retain old slide snapshots.
          images.clear();
          image = new Image();
          image.onload = invalidate;
          image.src = url;
          images.set(url, image);
        }
        if (image.complete && image.naturalWidth) {
          const size = style.backgroundSize.split(" ");
          const width = rect.width * (parseFloat(size[0]) || 100) / 100;
          const height = rect.height * (parseFloat(size[1] ?? size[0]) || 100) / 100;
          const position = style.backgroundPosition.split(" ");
          const x = rect.left + (rect.width - width) * (parseFloat(position[0]) || 0) / 100;
          const y = rect.top + (rect.height - height) * (parseFloat(position[1]) || 0) / 100;
          compositeContext.drawImage(image, x, y, width, height);
        }
      }
      const fill = preview.querySelector<HTMLImageElement>(".sample-material");
      if (fill?.complete && fill.naturalWidth) {
        const width = fill.clientWidth, height = fill.clientHeight;
        const x = rect.left + fill.offsetLeft + width / 2;
        const y = rect.top + fill.offsetTop + height / 2;
        const rotation = parseFloat(fill.style.transform.replace("rotate(", "")) || 0;
        const radii = getComputedStyle(fill).borderTopLeftRadius.split(" ");
        const rx = parseFloat(radii[0]) / 100 * width;
        const ry = parseFloat(radii[1] ?? radii[0]) / 100 * height;
        compositeContext.save();
        compositeContext.translate(x, y); compositeContext.rotate(rotation * Math.PI / 180);
        compositeContext.beginPath();
        compositeContext.roundRect(-width / 2, -height / 2, width, height, { x: Math.min(rx, width / 2), y: Math.min(ry, height / 2) });
        compositeContext.clip();
        compositeContext.drawImage(fill, -width / 2, -height / 2, width, height);
        compositeContext.restore();
      }
      compositeContext.restore();
    }

    function paintSurfaces(items: Surface[], backdrop: HTMLCanvasElement) {
      if (!items.length || !device || !core || !texture || !gpuContext) return;
      // A crop must never contain another control's glass (e.g. a scrolling card
      // behind the fixed footer). Keep nearby/overlapping surfaces in separate passes.
      const batches: Surface[][] = [];
      for (const item of items) {
        const batch = batches.find(group => group.every(other =>
          item.rect.right + 64 <= other.rect.left || other.rect.right + 64 <= item.rect.left ||
          item.rect.bottom + 64 <= other.rect.top || other.rect.bottom + 64 <= item.rect.top));
        if (batch) batch.push(item);
        else batches.push([item]);
      }
      device.queue.copyExternalImageToTexture({ source: backdrop }, { texture }, [output.width, output.height]);
      for (const batch of batches) paintBatch(batch);
    }

    function paintBatch(items: Surface[]) {
      if (!device || !core || !texture || !gpuContext) return;
      const scene = new Scene();
      // Batch matching materials instead of allocating one compositor per button.
      for (const material of ["white", "white-selected", "accent"] as const) {
        const matching = items.filter(surface => surface.material === material);
        if (!matching.length) continue;
        const settings = applyPreset(material === "accent" ? "black" : "white", cloneSettings());
        // UI-sized glass needs gentler optics than a large PowerPoint shape.
        settings.ior = 1.3;
        settings.specularStrength *= .5;
        settings.oppositeSpecularStrength *= .5;
        settings.specularOpacity = .3;
        settings.reflectionOffset = 0;
        if (material === "accent") settings.tint = { r: .24, g: .22, b: .66, a: .80 };
        if (material === "white-selected") settings.tint.a = .65;
        const container = createGlassContainer(settings);
        matching.forEach(({ rect, radius }) => container.add(new Glass({
          x: rect.left, y: rect.top, width: rect.width, height: rect.height,
          cornerRadius: radius, cornerSmoothing: 0
        })));
        scene.add(container);
      }
      core.render({ scene, width: output.width, height: output.height, dpr: 1,
        outputTexture: gpuContext.getCurrentTexture(), backdropTexture: texture });
      if (disposed) return;
      // Canvas snapshots preserve submitted GPU work ordering. Do not yield between
      // measuring DOM geometry and presenting it: that used to paste old scroll positions.
      for (const { context, canvas, rect, element } of items) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
        const width = Math.min(output.width, rect.right) - left;
        const height = Math.min(output.height, rect.bottom) - top;
        if (width > 0 && height > 0) context.drawImage(output, left, top, width, height,
          left - rect.left, top - rect.top, width, height);
        element.dataset.liquidReady = "true";
      }
    }

    function resize() {
      const width = Math.max(1, Math.ceil(innerWidth)), height = Math.max(1, Math.ceil(innerHeight));
      if (background.width === width && background.height === height && (!core || texture)) return;
      background.width = composite.width = output.width = width;
      background.height = composite.height = output.height = height;
      texture?.destroy();
      if (device) texture = device.createTexture({ size: [width, height], format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      dirty = true;
    }

    function releaseGpu() {
      for (const { canvas, element } of surfaces.values()) {
        canvas.remove(); element.removeAttribute("data-liquid-ready");
      }
      surfaces.clear();
      texture?.destroy(); texture = undefined;
      core?.destroy(); core = undefined;
      gpuContext?.unconfigure(); gpuContext = null;
      device?.destroy(); device = undefined;
    }

    function tick(now: number) {
      if (disposed) return;
      // Request the next display frame immediately, without waiting for a GPU fence.
      // At most two frames may be in flight; skipped frames retain their dirty state.
      request = requestAnimationFrame(tick);
      if (document.hidden || !paneVisible || pausedRef.current ||
        framesInFlight >= 2 || (reducedMotion.matches && !dirty)) return;
      dirty = false;
      try {
        resize();
        drawOrbs(backgroundContext!, background.width, background.height, reducedMotion.matches ? 0 : (now - animationOrigin) / 1000);
        if (core) {
          const visible = collectSurfaces();
          paintSurfaces(visible.filter(item => !item.overPreview), background);
          const overlay = visible.filter(item => item.overPreview);
          const geometry = JSON.stringify(overlay.map(({ rect }) => [rect.left, rect.top, rect.width, rect.height]));
          // The preview image does not animate with the orbs. Reuse its glass until
          // its content or geometry changes, including every step of the thumb transition.
          if (overlay.length && (overlayDirty || overlayGeometry !== geometry)) {
            drawPreviewBackdrop();
            paintSurfaces(overlay, composite);
            overlayGeometry = geometry;
            overlayDirty = false;
          }
          framesInFlight++;
          void device!.queue.onSubmittedWorkDone().then(
            () => { framesInFlight--; },
            () => { framesInFlight--; if (!disposed) releaseGpu(); }
          );
        }
      } catch {
        // A GPU failure must not disable the actual PowerPoint controls.
        releaseGpu();
      }
    }

    async function initialize() {
      try {
        const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "low-power" });
        if (adapter && !disposed) {
          const createdDevice = await adapter.requestDevice();
          if (disposed) { createdDevice.destroy(); return; }
          device = createdDevice;
          const format = navigator.gpu.getPreferredCanvasFormat();
          gpuContext = output.getContext("webgpu");
          if (!gpuContext) throw new Error("WebGPU canvas unavailable");
          gpuContext.configure({ device, format, alphaMode: "premultiplied",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
          core = new WebGpuGlassCore({ device, format });
        }
      } catch { releaseGpu(); }
      if (!disposed) request = requestAnimationFrame(tick);
    }
    void initialize();
    return () => {
      disposed = true;
      cancelAnimationFrame(request);
      observer.disconnect();
      window.removeEventListener("resize", invalidate);
      window.removeEventListener("scroll", interact, true);
      window.removeEventListener("wheel", interact);
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", interact);
      document.removeEventListener("visibilitychange", visibilityChanged);
      document.removeEventListener("load", invalidate, true);
      document.removeEventListener("liquidslide-pane-visibility", paneVisibilityChanged);
      reducedMotion.removeEventListener("change", invalidate);
      images.clear();
      releaseGpu();
    };
  }, []);
  return <canvas ref={backgroundRef} className="liquid-ui-backdrop" aria-hidden="true" />;
}
