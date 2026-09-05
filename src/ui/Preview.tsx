import { previewBounds } from "../domain/previewBounds";
import { useEffect, useState } from "react";
import type { LiquidGlassSettingsV1, SelectedShapeInfo } from "../domain/types";
import type { LiquidDomRenderer } from "../rendering/LiquidDomRenderer";

export interface PreviewSource { slideImageBase64: string; shape: SelectedShapeInfo }
let samplePromise: Promise<string> | null = null;
function loadSample(): Promise<string> {
  if (!samplePromise) samplePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    image.onerror = () => {
      if (!image.src.endsWith("preview-fallback.svg")) { image.src = "assets/preview-fallback.svg"; return; }
      samplePromise = null; reject(new Error("示例背景加载失败"));
    };
    image.src = "assets/preview-background.jpg";
  });
  return samplePromise;
}

export function Preview({ settings, renderer, source }: {
  settings: LiquidGlassSettingsV1; renderer: LiquidDomRenderer; source: PreviewSource | null;
}) {
  const [frame, setFrame] = useState<{ image: string; background: string; shape: SelectedShapeInfo; real: boolean } | null>(null);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    const timeout = window.setTimeout(async () => {
      try {
        const circle = settings.shapeMode === "circle";
        const shape = source?.shape ?? {
          id: "preview", slideId: "preview", left: circle ? 165 : 75, top: 88,
          width: circle ? 150 : 330, height: 150, rotation: 0, adjustment: 0.2,
          slideWidth: 480, slideHeight: 315.333333
        };
        const background = source?.slideImageBase64 ?? await loadSample();
        const rendered = await renderer.render({ slideImageBase64: background, shape,
          settings: { ...settings, shapeMode: shape.shapeMode ?? settings.shapeMode, outputScale: source ? settings.outputScale : 2 } });
        if (!cancelled) {
          setFrame({ image: `data:image/png;base64,${rendered.pngBase64}`, background, shape, real: Boolean(source) });
          setError("");
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "预览渲染失败");
      } finally { if (!cancelled) setRendering(false); }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [renderer, settings, source]);

  const bounds = frame ? (frame.real ? previewBounds(frame.shape) : { left: 0, top: 0, width: frame.shape.slideWidth, height: frame.shape.slideHeight }) : null;
  return <div className="preview" aria-label="液态玻璃预览" aria-busy={rendering}
    style={{
      backgroundImage: `url(${frame ? `data:image/png;base64,${frame.background}` : "assets/preview-background.jpg"})`,
      aspectRatio: bounds ? `${bounds.width} / ${bounds.height}` : "1440 / 946",
      backgroundSize: frame && bounds ? `${frame.shape.slideWidth / bounds.width * 100}% ${frame.shape.slideHeight / bounds.height * 100}%` : undefined,
      backgroundPosition: frame && bounds ? `${bounds.left / (frame.shape.slideWidth - bounds.width || 1) * 100}% ${bounds.top / (frame.shape.slideHeight - bounds.height || 1) * 100}%` : undefined
    }}>
    {frame && bounds && <img className="sample-material" src={frame.image}
      alt={frame.real ? "当前选区与真实背景的玻璃效果" : "示例背景上的玻璃效果"} style={{
        left: `${(frame.shape.left - bounds.left) / bounds.width * 100}%`, top: `${(frame.shape.top - bounds.top) / bounds.height * 100}%`,
        width: `${frame.shape.width / bounds.width * 100}%`, height: `${frame.shape.height / bounds.height * 100}%`,
        transform: `rotate(${frame.shape.rotation}deg)`,
        borderRadius: (frame.shape.shapeMode ?? settings.shapeMode) === "circle" ? "50%" : `${(frame.shape.adjustment ?? 0.16667) * Math.min(frame.shape.width, frame.shape.height) / frame.shape.width * 100}% / ${(frame.shape.adjustment ?? 0.16667) * Math.min(frame.shape.width, frame.shape.height) / frame.shape.height * 100}%`
      }} />}
    {error && <span className="preview-error" role="alert">{error}</span>}
    <small>{rendering ? "正在渲染…" : frame?.real ? "当前选区 · 真实背景" : "示例材质"}</small>
  </div>;
}
