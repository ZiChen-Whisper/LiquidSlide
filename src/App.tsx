import { UserPresets } from "./ui/UserPresets";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { DEFAULT_SETTINGS, cloneSettings } from "./domain/settings";
import { RenderCoordinator } from "./host/RenderCoordinator";
import type { LiquidGlassSettingsV1, RuntimeCapabilities, SelectedShapeInfo } from "./domain/types";
import { ComHostAdapter } from "./host/ComHostAdapter";
import { WebGpuLiquidDomRenderer } from "./rendering/LiquidDomRenderer";
import { InfoTip, ParameterControl } from "./ui/ParameterControl";
import { SelectControl } from "./ui/SelectControl";
import { PARAMETER_GROUPS } from "./ui/parameterDefinitions";
import { Preview, type PreviewSource } from "./ui/Preview";
import { MATERIAL_PRESETS, applyPreset } from "./domain/presets";
import { ColorPicker } from "./ui/ColorPicker";
import packageInfo from "../package.json";

const COMMON_PARAMETERS = new Set(["blur", "thickness", "specularStrength", "brightness"]);
const APP_VERSION = packageInfo.version;

function SettingsDetails({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`settings-details ${open ? "open" : ""}`}>
    <button type="button" className="settings-details-summary" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{title}</span><span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    <div className="settings-details-content" aria-hidden={!open} inert={!open}>
      <div className="settings-details-inner">{children}</div>
    </div>
  </section>;
}

export default function App() {
  const adapter = useMemo(() => new ComHostAdapter(), []);
  const renderer = useMemo(() => new WebGpuLiquidDomRenderer(), []);
  const coordinator = useMemo(() => new RenderCoordinator(adapter, renderer), [adapter, renderer]);
  const [settings, storeSettings] = useState<LiquidGlassSettingsV1>(() => cloneSettings());
  const [activePresetId, setActivePresetId] = useState<string | null>(MATERIAL_PRESETS[0].id);
  const [selectedShape, setSelectedShape] = useState<SelectedShapeInfo | null>(null);
  const [status, setStatus] = useState("在幻灯片中选择图形，即可预览或生成。");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<PreviewSource | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [paneVisible, setPaneVisible] = useState(true);
  const [real, setReal] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const revision = useRef(0);
  const selectionRefreshId = useRef(0);
  const setSettings = useCallback((value: SetStateAction<LiquidGlassSettingsV1>) => {
    revision.current++;
    storeSettings(value);
    setActivePresetId(null);
  }, []);
  const preserveSettings = useCallback((value: SetStateAction<LiquidGlassSettingsV1>) => {
    revision.current++;
    storeSettings(value);
  }, []);
  const setPresetSettings = useCallback((value: LiquidGlassSettingsV1, presetId: string | null) => {
    revision.current++;
    storeSettings(value);
    setActivePresetId(presetId);
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
    const refreshId = ++selectionRefreshId.current;
    try {
      const selection = await adapter.inspectSelection();
      if (refreshId !== selectionRefreshId.current) return;
      setSelectedShape(selection.shape);
      if (selection.savedSettings) {
        const nextSettings = { ...selection.savedSettings, shapeMode: selection.shape.shapeMode ?? selection.savedSettings.shapeMode };
        const matchingSystemPreset = MATERIAL_PRESETS.find((preset) => JSON.stringify(applyPreset(preset.id, nextSettings)) === JSON.stringify(nextSettings));
        setPresetSettings(nextSettings, matchingSystemPreset?.id ?? null);
        setStatus("已读取图形，并恢复上次保存的 LiquidSlide 参数。");
      } else {
        preserveSettings((current) => ({ ...current, shapeMode: selection.shape.shapeMode ?? current.shapeMode }));
        setStatus(`已读取图形：${Math.round(selection.shape.width)} × ${Math.round(selection.shape.height)} pt`);
      }
    } catch (reason) {
      if (refreshId !== selectionRefreshId.current) return;
      setSelectedShape(null);
      setStatus(reason instanceof Error ? reason.message : "读取选区失败。");
    }
  }, [adapter, preserveSettings, setPresetSettings]);

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
    adapter.onSelectionChanged = () => {
      revision.current++;
      void refreshSelection().finally(() => setSceneVersion((value) => value + 1));
    };
    let cancelled = false;
    // Finish initial selection loading before the host can deliver a queued shortcut.
    void refreshSelection().then(() => {
      if (!cancelled && adapter.available) return adapter.ready();
    }).catch((error: Error) => setStatus(error.message));
    return () => { cancelled = true; adapter.onPreset = undefined; adapter.onCancelCommand = undefined; adapter.onHidden = undefined; adapter.onShown = undefined; adapter.onSelectionChanged = undefined; };
  }, [adapter, refreshSelection]);

  useEffect(() => {
    if (adapter.available) void adapter.watchSelection(paneVisible).catch((error: Error) => setStatus(error.message));
    return () => { if (adapter.available) void adapter.watchSelection(false).catch(() => {}); };
  }, [paneVisible, adapter]);

  useEffect(() => {
    if (!real || busy || !paneVisible) return;
    if (settings.shapeMode === "custom" || selectedShape?.shapeMode === "custom") {
      setSource(null);
      setStatus("当前图形暂不支持真实预览，请切换到示例模式；应用效果仍支持此图形。 ");
      return;
    }
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
  }, [real, sceneVersion, busy, paneVisible, coordinator, selectedShape, settings.shapeMode]);

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
      preserveSettings(result.settings);
      if (preset && MATERIAL_PRESETS.some((item) => item.id === preset)) setActivePresetId(preset);
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
          <p className={available ? "connection ok" : "connection error"} title={capabilities.message}>{available ? `已连接 PowerPoint · ${APP_VERSION}` : capabilities.message}</p>
        </div>
        <button className="about-link" disabled={!adapter.available} onClick={() => void adapter.showAbout().catch((error: Error) => setStatus(error.message))}>关于</button>
      </header>

      <div className="preview-card">
        <div className="card-heading"><h2>材质预览</h2></div>
        <Preview settings={settings} renderer={renderer} source={real ? source : null} real={real}
          disabled={busy} available={available} onModeChange={(value) => {
            if (value && (settings.shapeMode === "custom" || selectedShape?.shapeMode === "custom"))
              setStatus("当前图形暂不支持真实预览，请切换到示例模式；应用效果仍支持此图形。 ");
            if (value) setReal(true); else showSample();
          }} />
        <div className="preview-actions">
          <span>{selectedShape?.shapeMode ? `自动识别 · ${selectedShape.shapeMode === "circle" ? "正圆" : selectedShape.shapeMode === "custom" ? "自由轮廓" : "圆角矩形"}` : "自动识别所选图形"}</span>
        </div>
      </div>

      <fieldset disabled={busy} className="material-settings">
      <section className="presets-section">
        <div className="card-heading"><h2>材质</h2><span>选择一种质感</span></div>
        <div className="preset-grid">
          {MATERIAL_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return <button key={preset.id} className={`preset ${preset.id} ${active ? "active" : ""}`} aria-pressed={active}
              onClick={() => setPresetSettings(applyPreset(preset.id, settings), preset.id)}>
              <img className="material-icon" src={`assets/${preset.image}.png`} alt="" />
              <span><strong>{preset.name}</strong><small>{preset.description}</small></span>
            </button>;
          })}
        </div>
      </section>
      <UserPresets settings={settings} renderer={renderer} activePresetId={activePresetId} onApply={setPresetSettings} onStatus={setStatus} />
      <section className="quick-settings">
        <div className="card-heading"><h2>自定义材质</h2><button type="button" className="primary reset-custom-button" onClick={() => setPresetSettings(applyPreset("clear", settings), "clear")}>重置</button></div>
        {PARAMETER_GROUPS.flatMap((group) => group.parameters).filter((parameter) => COMMON_PARAMETERS.has(parameter.key)).map((parameter) => (
          <ParameterControl key={parameter.key} definition={parameter} value={settings[parameter.key] as number} defaultValue={DEFAULT_SETTINGS[parameter.key] as number} onChange={(value) => setSettings({ ...settings, [parameter.key]: value })} />
        ))}
        <div className="select-row"><span className="setting-label"><span>玻璃颜色</span><InfoTip label="玻璃颜色说明" description="使用下拉色盘选择颜色，也可以直接输入 HEX 或 RGB 数值" /></span><ColorPicker value={settings.tint} disabled={busy} onChange={(color) => setSettings((current) => ({ ...current, tint: { ...current.tint, ...color } }))} /></div>
        <div className="parameter tint-parameter">
          <div className="parameter-heading">
            <span className="parameter-label"><span>染色强度</span><InfoTip label="染色强度说明" description="0 表示无染色，1 表示完全覆盖为所选颜色" /></span>
            <button className="reset-one" title="恢复默认值" aria-label="重置染色强度" type="button"
              onClick={() => setSettings({ ...settings, tint: { ...settings.tint, a: DEFAULT_SETTINGS.tint.a } })}>↺</button>
          </div>
          <div className="parameter-inputs">
            <input type="range" min="0" max="1" step="0.01" value={settings.tint.a}
              aria-label="染色强度滑块"
              style={{ background: `linear-gradient(to right, #7771c1 ${settings.tint.a * 100}%, #e9e8f1 ${settings.tint.a * 100}%)` }}
              onChange={(event) => setSettings({ ...settings, tint: { ...settings.tint, a: Math.min(1, Math.max(0, Number(event.target.value))) } })} />
            <input className="number" type="number" min="0" max="1" step="0.01" value={settings.tint.a} aria-label="染色强度数值"
              onChange={(event) => setSettings({ ...settings, tint: { ...settings.tint, a: Math.min(1, Math.max(0, Number(event.target.value))) } })} />
          </div>
        </div>
      </section>
      <button className="advanced-toggle" aria-expanded={advanced} aria-controls="advanced-settings" onClick={() => setAdvanced(!advanced)}>
        <span>高级设置 <small>微调材质参数</small></span><span aria-hidden="true">{advanced ? "−" : "+"}</span>
      </button>
      <div id="advanced-settings" className={`advanced-panel ${advanced ? "open" : ""}`} aria-hidden={!advanced} inert={!advanced}>
      <div className="advanced-panel-inner">
      <section>
        <div className="select-row"><span className="setting-label"><span>输出倍率</span><InfoTip label="输出倍率说明" description="倍率越高越清晰，但生成更慢、PPT 文件更大；通常选 2×" /></span>
          <SelectControl ariaLabel="输出倍率" value={String(settings.outputScale)} options={[{ value: "1", label: "1×" }, { value: "2", label: "2×（默认）" }, { value: "3", label: "3×" }]}
            onChange={(value) => setSettings({ ...settings, outputScale: Number(value) as 1 | 2 | 3 })} />
        </div>
        {!selectedShape?.shapeMode && <div className="select-row"><span className="setting-label"><span>示例形状</span><InfoTip label="示例形状说明" description="没有选中 PPT 图形时，选择用于面板示例预览的形状" /></span>
          <SelectControl ariaLabel="示例形状" value={settings.shapeMode} options={[{ value: "roundedRectangle", label: "圆角矩形" }, { value: "circle", label: "正圆" }]}
            onChange={(value) => setSettings({ ...settings, shapeMode: value as LiquidGlassSettingsV1["shapeMode"] })} />
        </div>}
      </section>      {PARAMETER_GROUPS.map((group) => (
        <SettingsDetails key={group.title} title={group.title} defaultOpen={group.title !== "高级"}>
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
            <div className="select-row"><span className="setting-label"><span>高光宽度</span><InfoTip label="高光宽度说明" description="控制高光线的宽度；设备单像素适合保持细腻清晰" /></span>
              <SelectControl ariaLabel="高光宽度" value={String(settings.specularWidth)} options={[{ value: "hairline", label: "设备单像素" }, { value: "1", label: "1 px（默认）" }, { value: "2", label: "2 px" }, { value: "4", label: "4 px" }, { value: "8", label: "8 px" }]}
                onChange={(value) => setSettings({ ...settings, specularWidth: value === "hairline" ? "hairline" : Number(value) })} />
            </div>
          )}
          {group.title === "折射" && (
            <div className="select-row"><span className="setting-label"><span>表面轮廓</span><InfoTip label="表面轮廓说明" description="凸面像鼓起的玻璃；凹面像向内凹陷；边缘唇形让折射集中在边缘" /></span>
              <SelectControl ariaLabel="表面轮廓" value={settings.surfaceProfile} options={[{ value: "convex", label: "凸面（默认）" }, { value: "concave", label: "凹面" }, { value: "lip", label: "边缘唇形" }]}
                onChange={(value) => setSettings({ ...settings, surfaceProfile: value as LiquidGlassSettingsV1["surfaceProfile"] })} />
            </div>
          )}
          {group.title === "高级" && (
            <>
              <label className="check"><input type="checkbox" checked={settings.normalDivergenceBlendEnabled} onChange={(event) => setSettings({ ...settings, normalDivergenceBlendEnabled: event.target.checked })} /><span className="setting-label"><span>启用法线门控</span><InfoTip label="法线门控说明" description="减轻尖角和凹陷处的高光接缝，通常保持开启" /></span></label>
              <label className="check"><input type="checkbox" checked={settings.debugDisplacement} onChange={(event) => setSettings({ ...settings, debugDisplacement: event.target.checked })} /><span className="setting-label"><span>显示位移调试图</span><InfoTip label="位移调试图说明" description="用彩色显示折射偏移；只用于诊断，制作玻璃时请关闭" /></span></label>
            </>
          )}
        </SettingsDetails>
      ))}

      <button className="text-button reset-all" onClick={() => setPresetSettings(applyPreset("clear", settings), "clear")}>恢复默认材质</button>
      </div>
      </div>
      </fieldset>
      <footer>
        <p className="status" role="status">{status}</p>
        <div className="footer-actions">
      <button className="secondary shadow-action" type="button" title="立即添加 PowerPoint 原生柔和阴影，让玻璃浮在背景上" aria-label="添加图形阴影" disabled={busy || !available} onClick={() => void editShape(false)}>
          <svg viewBox="0 0 28 28" width="26" height="26" fill="none" aria-hidden="true">
            <rect x="7" y="10" width="17" height="13" rx="4" fill="currentColor" opacity=".08" />
            <rect x="6" y="9" width="17" height="13" rx="4" fill="currentColor" opacity=".14" />
            <rect x="4" y="5" width="17" height="13" rx="4" fill="#f0f1ff" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button className="secondary shadow-action" type="button" title="立即去除 PPT 原有外框线，保留玻璃自身高光" aria-label="去除图形描边" disabled={busy || !available} onClick={() => void editShape(true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" strokeDasharray="3 2" /><path d="m3 21 18-18" /></svg>
        </button>
        <button className="primary apply-button" type="button" disabled={busy || !available} onClick={() => void capture()}>
          {busy && <span className="loading-spinner" aria-hidden="true" />}<span>{busy ? "处理中…" : "应用效果"}</span>
        </button>
        </div>
      </footer>
    </main>
  );
}
