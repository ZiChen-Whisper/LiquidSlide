import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, cloneSettings } from "./domain/settings";
import { validateShape } from "./domain/geometry";
import type { LiquidGlassSettingsV1, RuntimeCapabilities, SelectedShapeInfo } from "./domain/types";
import { ComHostAdapter } from "./host/ComHostAdapter";
import { WebGpuLiquidDomRenderer } from "./rendering/LiquidDomRenderer";
import { ParameterControl } from "./ui/ParameterControl";
import { PARAMETER_GROUPS } from "./ui/parameterDefinitions";
import { Preview, type PreviewSource } from "./ui/Preview";
import { MATERIAL_PRESETS, applyPreset } from "./domain/presets";

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

export default function App() {
  const adapter = useMemo(() => new ComHostAdapter(), []);
  const renderer = useMemo(() => new WebGpuLiquidDomRenderer(), []);
  const [settings, setSettings] = useState<LiquidGlassSettingsV1>(() => cloneSettings());
  const [selectedShape, setSelectedShape] = useState<SelectedShapeInfo | null>(null);
  const [status, setStatus] = useState("在幻灯片中选择图形，即可预览或生成。");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities>({
    officeReady: adapter.available,
    officeApiSupported: adapter.available,
    webGpuSupported: Boolean(navigator.gpu),
    message: ""
  });

  const refreshSelection = useCallback(async () => {
    try {
      const selection = await adapter.inspectSelection();
      setSelectedShape(selection.shape);
      if (selection.savedSettings) {
        setSettings({ ...selection.savedSettings, shapeMode: selection.shape.shapeMode ?? selection.savedSettings.shapeMode });
        setStatus("已读取图形，并恢复上次保存的 LiquidSlide 参数。");
      } else {
        setSettings((current) => ({ ...current, shapeMode: selection.shape.shapeMode ?? current.shapeMode }));
        setStatus(`已读取图形：${Math.round(selection.shape.width)} × ${Math.round(selection.shape.height)} pt`);
      }
    } catch (reason) {
      setSelectedShape(null);
      setStatus(reason instanceof Error ? reason.message : "读取选区失败。");
    }
  }, [adapter]);

  useEffect(() => {
    const officeApiSupported = adapter.available;
    const webGpuSupported = Boolean(navigator.gpu);
    setCapabilities({
      officeReady: true,
      officeApiSupported,
      webGpuSupported,
      message: !officeApiSupported
        ? "未连接 PowerPoint COM 宿主"
        : !webGpuSupported ? "当前 WebView2 不支持 WebGPU" : "运行环境可用"
    });
    void refreshSelection();
    return () => {
      renderer.destroy();
    };
  }, [adapter, refreshSelection, renderer]);

  const capture = async (writeFill: boolean) => {
    setBusy(true);
    try {
      const { shape } = await adapter.inspectSelection();
      const effective = { ...settings, shapeMode: shape.shapeMode ?? settings.shapeMode };
      setSelectedShape(shape);
      setSettings(effective);
      validateShape(shape, effective.shapeMode);
      setStatus("正在读取选区背景…");
      const slideImageBase64 = await adapter.captureBackground(shape.id, shape.slideId);
      setSource({ slideImageBase64, shape });
      if (writeFill) {
        setStatus("正在生成并更新图形填充…");
        const result = await renderer.render({ slideImageBase64, shape, settings: effective });
        await adapter.applyFill(shape.id, result.pngBase64, effective, shape.slideId);
        setStatus(`已更新 · ${result.width} × ${result.height} px`);
      } else {
        setStatus("已读取真实背景。调整材质可继续预览，点击生成后应用。");
      }
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "操作失败，请重试。");
    } finally { setBusy(false); }
  };
  const addShadow = async () => {
    setBusy(true);
    try {
      const { shape } = await adapter.inspectSelection();
      await adapter.applyShadow(shape.id, shape.slideId);
      setStatus("已添加原生阴影 · 黑色 / 95% 透明 / 20 pt / 102% / 0 pt");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "添加阴影失败。");
    } finally { setBusy(false); }
  };
  const available = capabilities.officeApiSupported && capabilities.webGpuSupported;
  return (
    <main>
      <header>
        <div>
          <h1>LiquidSlide</h1>
          <p>Liquid Glass for PowerPoint</p>
        </div>
        <span className={available ? "badge ok" : "badge error"}>{capabilities.message}</span>
      </header>

      <div className="preview-card">
        <div className="card-heading"><h2>材质预览</h2>{source && <button className="text-button" disabled={busy} onClick={() => setSource(null)}>返回示例</button>}</div>
        <Preview settings={settings} renderer={renderer} source={source} />
        <div className="preview-actions">
          <span>{selectedShape?.shapeMode ? `自动识别 · ${selectedShape.shapeMode === "circle" ? "正圆" : "圆角矩形"}` : "自动识别所选图形"}</span>
          <button type="button" className="secondary" onClick={() => void capture(false)} disabled={busy || !available}>真实预览</button>
        </div>
      </div>

      <fieldset disabled={busy} className="material-settings">
      <section className="presets-section">
        <div className="card-heading"><h2>材质</h2><span>选择一种质感</span></div>
        <div className="preset-grid">
          {MATERIAL_PRESETS.map((preset) => {
            const active = JSON.stringify(applyPreset(preset.id, settings)) === JSON.stringify(settings);
            return <button key={preset.id} className={`preset ${preset.id} ${active ? "active" : ""}`} aria-pressed={active}
              onClick={() => setSettings(applyPreset(preset.id, settings))}>
              <span className="swatch" aria-hidden="true"><i /></span>
              <span><strong>{preset.name}</strong><small>{preset.description}</small></span>
            </button>;
          })}
        </div>
      </section>
      <button className="advanced-toggle" aria-expanded={advanced} aria-controls="advanced-settings" onClick={() => setAdvanced(!advanced)}>
        <span>高级设置 <small>微调材质参数</small></span><span aria-hidden="true">{advanced ? "−" : "+"}</span>
      </button>
      {advanced && <div id="advanced-settings">
      <section>
        <label className="select-row">输出倍率
          <select value={settings.outputScale} onChange={(event) => setSettings({ ...settings, outputScale: Number(event.target.value) as 1 | 2 | 3 })}>
            <option value={1}>1×</option><option value={2}>2×（默认）</option><option value={3}>3×</option>
          </select>
        </label>
        {!selectedShape?.shapeMode && <label className="select-row">示例形状
          <select value={settings.shapeMode} onChange={(event) => setSettings({ ...settings, shapeMode: event.target.value as LiquidGlassSettingsV1["shapeMode"] })}>
            <option value="roundedRectangle">圆角矩形</option><option value="circle">正圆</option>
          </select>
        </label>}
      </section>      {PARAMETER_GROUPS.map((group) => (
        <details key={group.title} open={group.title !== "高级"}>
          <summary>{group.title}</summary>
          {group.parameters.map((parameter) => (
            <ParameterControl
              key={parameter.key}
              definition={parameter}
              value={settings[parameter.key] as number}
              defaultValue={DEFAULT_SETTINGS[parameter.key] as number}
              onChange={(value) => setSettings({ ...settings, [parameter.key]: value })}
            />
          ))}
          {group.title === "高光与反射" && (
            <label className="select-row">高光宽度
              <select value={String(settings.specularWidth)} onChange={(event) => setSettings({ ...settings, specularWidth: event.target.value === "hairline" ? "hairline" : Number(event.target.value) })}>
                <option value="hairline">设备单像素</option><option value="1">1 px（默认）</option><option value="2">2 px</option><option value="4">4 px</option><option value="8">8 px</option>
              </select>
            </label>
          )}
          {group.title === "折射" && (
            <label className="select-row">表面轮廓
              <select value={settings.surfaceProfile} onChange={(event) => setSettings({ ...settings, surfaceProfile: event.target.value as LiquidGlassSettingsV1["surfaceProfile"] })}>
                <option value="convex">凸面（默认）</option><option value="concave">凹面</option><option value="lip">边缘唇形</option>
              </select>
            </label>
          )}
          {group.title === "颜色与合成" && (
            <>
              <label className="select-row">玻璃颜色
                <input type="color" value={rgbToHex(settings.tint)} onChange={(event) => setSettings({ ...settings, tint: { ...settings.tint, ...hexToRgb(event.target.value) } })} />
              </label>
              <label className="select-row">颜色透明度
                <input type="number" min="0" max="1" step="0.01" value={settings.tint.a} onChange={(event) => setSettings({ ...settings, tint: { ...settings.tint, a: Math.min(1, Math.max(0, Number(event.target.value))) } })} />
              </label>
            </>
          )}
          {group.title === "高级" && (
            <>
              <label className="check"><input type="checkbox" checked={settings.normalDivergenceBlendEnabled} onChange={(event) => setSettings({ ...settings, normalDivergenceBlendEnabled: event.target.checked })} />启用法线门控</label>
              <label className="check"><input type="checkbox" checked={settings.debugDisplacement} onChange={(event) => setSettings({ ...settings, debugDisplacement: event.target.checked })} />显示位移调试图</label>
            </>
          )}
        </details>
      ))}

      <button className="text-button reset-all" onClick={() => setSettings(applyPreset("clear", settings))}>恢复默认材质</button>
      </div>}
      </fieldset>
      <footer>
        <p className="status" role="status">{status}</p>
        <div className="footer-actions">
      <button className="secondary shadow-action" type="button" title="添加图形阴影" aria-label="添加图形阴影" disabled={busy || !available} onClick={() => void addShadow()}>
          <svg viewBox="0 0 28 28" width="26" height="26" fill="none" aria-hidden="true">
            <rect x="7" y="10" width="17" height="13" rx="4" fill="currentColor" opacity=".08" />
            <rect x="6" y="9" width="17" height="13" rx="4" fill="currentColor" opacity=".14" />
            <rect x="4" y="5" width="17" height="13" rx="4" fill="#eef5f0" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button className="primary" type="button" disabled={busy || !available} onClick={() => void capture(true)}>{busy ? "处理中…" : "应用效果"}<span aria-hidden="true">↗</span></button>
        </div>
      </footer>
    </main>
  );
}
