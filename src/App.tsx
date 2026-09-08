import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { DEFAULT_SETTINGS, cloneSettings } from "./domain/settings";
import { RenderCoordinator } from "./host/RenderCoordinator";
import type { LiquidGlassSettingsV1, RuntimeCapabilities, SelectedShapeInfo } from "./domain/types";
import { ComHostAdapter } from "./host/ComHostAdapter";
import { WebGpuLiquidDomRenderer } from "./rendering/LiquidDomRenderer";
import { ParameterControl } from "./ui/ParameterControl";
import { PARAMETER_GROUPS } from "./ui/parameterDefinitions";
import { Preview, type PreviewSource } from "./ui/Preview";
import { MATERIAL_PRESETS, applyPreset } from "./domain/presets";

const COMMON_PARAMETERS = new Set(["blur", "thickness", "specularStrength"]);

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
  const coordinator = useMemo(() => new RenderCoordinator(adapter, renderer), [adapter, renderer]);
  const [settings, storeSettings] = useState<LiquidGlassSettingsV1>(() => cloneSettings());
  const [selectedShape, setSelectedShape] = useState<SelectedShapeInfo | null>(null);
  const [status, setStatus] = useState("在幻灯片中选择图形，即可预览或生成。");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [paneVisible, setPaneVisible] = useState(true);
  const [real, setReal] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const revision = useRef(0);
  const setSettings = useCallback((value: SetStateAction<LiquidGlassSettingsV1>) => {
    revision.current++;
    storeSettings(value);
  }, []);
  const actionBusy = useRef(false);
  const commandHandler = useRef<(preset: string, shape: SelectedShapeInfo, commandId?: string) => void>(() => {});
  const showSample = useCallback(() => {
    revision.current++;
    setReal(false);
    setSource(null);
  }, []);
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
  }, [adapter, setSettings]);

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
    return () => {
      renderer.destroy();
    };
  }, [adapter, refreshSelection, renderer]);

  useEffect(() => {
    adapter.onPreset = (preset, shape, commandId) => commandHandler.current(preset, shape, commandId);
    adapter.onCancelCommand = () => { revision.current++; };
    adapter.onHidden = () => { revision.current++; setPaneVisible(false); setSource(null); };
    adapter.onShown = () => setPaneVisible(true);
    adapter.onSelectionChanged = () => { revision.current++; setSceneVersion((value) => value + 1); };
    let cancelled = false;
    // Finish initial selection loading before the host can deliver a queued shortcut.
    void refreshSelection().then(() => {
      if (!cancelled && adapter.available) return adapter.ready();
    }).catch((error: Error) => setStatus(error.message));
    return () => { cancelled = true; adapter.onPreset = undefined; adapter.onCancelCommand = undefined; adapter.onHidden = undefined; adapter.onShown = undefined; adapter.onSelectionChanged = undefined; };
  }, [adapter, refreshSelection]);

  useEffect(() => {
    if (adapter.available) void adapter.watchSelection(real && paneVisible).catch((error: Error) => setStatus(error.message));
    return () => { if (adapter.available) void adapter.watchSelection(false).catch(() => {}); };
  }, [real, paneVisible, adapter]);

  useEffect(() => {
    if (!real || busy || !paneVisible) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        // Wait only for a transaction already in progress, never schedule recurring exports.
        while (coordinator.busy && !cancelled) await new Promise((resolve) => window.setTimeout(resolve, 30));
        if (cancelled) return;
        const result = await coordinator.captureSource(() => !cancelled);
        if (result && !cancelled) {
          setSelectedShape(result.shape);
          setSource(result);
          setStatus("真实预览 · 图形变化后刷新，点击应用效果写入填充");
        }
      } catch (reason) {
        if (!cancelled) {
          setSource(null);
          setSelectedShape(null);
          setStatus(reason instanceof Error ? reason.message : "读取真实预览失败。");
        }
      }
    };
    void refresh();
    return () => { cancelled = true; };
  }, [real, sceneVersion, busy, paneVisible, coordinator]);

  const capture = async (preset?: string, target?: SelectedShapeInfo, commandId?: string) => {
    if (actionBusy.current) {
      if (preset) await adapter.commandFinished("正在处理上一次操作，请稍后重试。", commandId);
      return;
    }
    revision.current++;
    actionBusy.current = true;
    setBusy(true);
    try {
      const version = revision.current;
      // Let an invalidated preview release the shared host transaction.
      while (coordinator.busy && version === revision.current) await new Promise((resolve) => window.setTimeout(resolve, 30));
      if (version !== revision.current) throw new Error("操作已取消。");
      adapter.commandId = commandId;
      setStatus("正在生成并更新图形填充…");
      const result = await coordinator.run(preset ? applyPreset(preset, settings) : settings, true,
        () => version === revision.current, target, true);
      if (!result) throw new Error("图形已移动或选区已变化，请重新应用。");
      setSelectedShape(result.shape);
      setSettings(result.settings);
      if (real) setSource(result);
      setStatus(`已更新 · ${result.rendered.width} × ${result.rendered.height} px`);
      if (preset) await adapter.commandFinished(undefined, commandId);
    } catch (reason) {
      const error = reason instanceof Error ? reason.message : "操作失败，请重试。";
      setStatus(error);
      if (preset) await adapter.commandFinished(error, commandId);
    } finally { adapter.commandId = undefined; setBusy(false); actionBusy.current = false; }
  };
  commandHandler.current = (preset, shape, commandId) => { void capture(preset, shape, commandId); };
  const editShape = async (outline: boolean) => {
    if (actionBusy.current) return;
    revision.current++;
    actionBusy.current = true;
    setBusy(true);
    try {
      while (coordinator.busy) await new Promise((resolve) => window.setTimeout(resolve, 30));
      const { shape } = await adapter.inspectSelection();
      if (outline) await adapter.removeOutline(shape);
      else await adapter.applyShadow(shape);
      setStatus(outline ? "已去除图形描边" : "已添加原生阴影 · 黑色 / 95% 透明 / 20 pt / 102% / 0 pt");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "添加阴影失败。");
    } finally { setBusy(false); actionBusy.current = false; }
  };
  const available = capabilities.officeApiSupported && capabilities.webGpuSupported;
  return (
    <main>
      <header>
        <div>
          <div className="brand"><img src="assets/brand.svg" alt="" /><h1>LiquidSlide</h1></div>
          <p>Liquid Glass for PowerPoint</p>
        </div>
        <button className="about-link" disabled={!adapter.available} onClick={() => void adapter.showAbout().catch((error: Error) => setStatus(error.message))}>关于</button>
        <span className={available ? "badge ok" : "badge error"} title={capabilities.message}>{available ? "已连接 PowerPoint" : capabilities.message}</span>
      </header>

      <div className="preview-card">
        <div className="card-heading"><h2>材质预览</h2></div>
        <Preview settings={settings} renderer={renderer} source={real ? source : null} real={real}
          disabled={busy} available={available} onModeChange={(value) => value ? setReal(true) : showSample()} />
        <div className="preview-actions">
          <span>{selectedShape?.shapeMode ? `自动识别 · ${selectedShape.shapeMode === "circle" ? "正圆" : "圆角矩形"}` : "自动识别所选图形"}</span>
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
              <img className="material-icon" src={`assets/${preset.name}.png`} alt="" />
              <span><strong>{preset.name}</strong><small>{preset.description}</small></span>
            </button>;
          })}
        </div>
      </section>
      <section className="quick-settings">
        <div className="card-heading"><h2>自定义材质</h2><button className="text-button" onClick={() => setSettings(applyPreset("clear", settings))}>重置</button></div>
        {PARAMETER_GROUPS.flatMap((group) => group.parameters).filter((parameter) => COMMON_PARAMETERS.has(parameter.key)).map((parameter) => (
          <ParameterControl key={parameter.key} definition={parameter} value={settings[parameter.key] as number} defaultValue={DEFAULT_SETTINGS[parameter.key] as number} onChange={(value) => setSettings({ ...settings, [parameter.key]: value })} />
        ))}
        <label className="select-row">玻璃颜色<input aria-label="玻璃颜色" type="color" value={rgbToHex(settings.tint)} onChange={(event) => setSettings({ ...settings, tint: { ...settings.tint, ...hexToRgb(event.target.value) } })} /></label>
        <label className="select-row">染色强度<input aria-label="染色强度" type="number" min="0" max="1" step="0.01" value={settings.tint.a} onChange={(event) => setSettings({ ...settings, tint: { ...settings.tint, a: Math.min(1, Math.max(0, Number(event.target.value))) } })} /></label>
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
          {group.parameters.filter((parameter) => !COMMON_PARAMETERS.has(parameter.key)).map((parameter) => (
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
      <button className="secondary shadow-action" type="button" title="添加图形阴影" aria-label="添加图形阴影" disabled={busy || !available} onClick={() => void editShape(false)}>
          <svg viewBox="0 0 28 28" width="26" height="26" fill="none" aria-hidden="true">
            <rect x="7" y="10" width="17" height="13" rx="4" fill="currentColor" opacity=".08" />
            <rect x="6" y="9" width="17" height="13" rx="4" fill="currentColor" opacity=".14" />
            <rect x="4" y="5" width="17" height="13" rx="4" fill="#f0f1ff" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button className="secondary shadow-action" type="button" title="去除图形描边" aria-label="去除图形描边" disabled={busy || !available} onClick={() => void editShape(true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" strokeDasharray="3 2" /><path d="m3 21 18-18" /></svg>
        </button>
        <button className="primary" type="button" disabled={busy || !available} onClick={() => void capture()}>{busy ? "处理中…" : "应用效果"}</button>
        </div>
      </footer>
    </main>
  );
}
