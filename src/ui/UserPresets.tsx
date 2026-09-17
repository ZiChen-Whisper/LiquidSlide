import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cloneSettings, normalizeSettings } from "../domain/settings";
import type { LiquidGlassSettingsV1, SelectedShapeInfo } from "../domain/types";
import type { LiquidDomRenderer } from "../rendering/LiquidDomRenderer";
import { loadSample } from "./Preview";

const PREFIX = "liquidslide.user-preset.v1.";
interface UserPreset { id: string; name: string; description: string; settings: LiquidGlassSettingsV1 }
type PresetPreviewStyle = CSSProperties & Record<`--${string}`, string>;
function readPresets(): UserPreset[] {
  const presets: UserPreset[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const item = JSON.parse(localStorage.getItem(key) ?? "null") as UserPreset | null;
      if (item && typeof item.name === "string" && item.settings?.schemaVersion === 1) {
        presets.push({ id: key.slice(PREFIX.length), name: item.name,
          description: typeof item.description === "string" && item.description.trim() ? item.description : "自定义材质",
          settings: normalizeSettings(item.settings) });
      }
    } catch { /* Preserve an unreadable entry instead of overwriting it. */ }
  }
  return presets.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function previewStyle(settings: LiquidGlassSettingsV1): PresetPreviewStyle {
  const tint = settings.tint;
  const alpha = clamp(0.1 + tint.a * 0.45 + settings.opacity * 0.05, 0.08, 0.72);
  return {
    "--preset-fill": `rgba(${Math.round(tint.r * 255)}, ${Math.round(tint.g * 255)}, ${Math.round(tint.b * 255)}, ${alpha})`,
    "--preset-blur": `${clamp(settings.blur / 2, 1, 12)}px`,
    "--preset-brightness": String(clamp(1 + settings.brightness / 250, 0.6, 1.4)),
    "--preset-specular": String(clamp(settings.specularStrength, 0, 1)),
    "--preset-dispersion": String(clamp(settings.dispersion / 0.1, 0, 1))
  };
}

function brightnessLabel(value: number) {
  const rounded = Math.round(value);
  return `亮度 ${rounded > 0 ? "+" : ""}${rounded}`;
}

const PRESET_PREVIEW_SHAPE: SelectedShapeInfo = {
  id: "preset-preview",
  slideId: "preset-preview",
  left: 0,
  top: 0,
  width: 170,
  height: 96,
  rotation: 0,
  adjustment: 0.2,
  slideWidth: 230,
  slideHeight: 160,
  shapeMode: "roundedRectangle"
};

function UserPresetPreview({ settings, renderer }: { settings: LiquidGlassSettingsV1; renderer: LiquidDomRenderer }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let cancelled = false;
    setImage("");
    void (async () => {
      try {
        const rendered = await renderer.render({
          slideImageBase64: await loadSample(),
          shape: PRESET_PREVIEW_SHAPE,
          settings: { ...settings, shapeMode: "roundedRectangle", outputScale: 1 }
        });
        if (!cancelled) setImage(`data:image/png;base64,${rendered.pngBase64}`);
      } catch { /* Keep a parameterized CSS fallback when WebGPU is unavailable. */ }
    })();
    return () => { cancelled = true; };
  }, [renderer, settings]);

  return <span className="user-preset-preview" style={previewStyle(settings)} aria-hidden="true">
    {image ? <img src={image} alt="" /> : <span className="user-preset-preview-fallback"><span className="user-preset-preview-shape" /></span>}
  </span>;
}

export function UserPresets({
  settings,
  renderer,
  activePresetId,
  onApply,
  onStatus
}: {
  settings: LiquidGlassSettingsV1;
  renderer: LiquidDomRenderer;
  activePresetId: string | null;
  onApply: (settings: LiquidGlassSettingsV1, presetId: string) => void;
  onStatus: (message: string) => void;
}) {
  const [items, setItems] = useState<UserPreset[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const saveFormRef = useRef<HTMLDivElement>(null);
  const skipDescriptionBlur = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (editingDescriptionId) descriptionRef.current?.focus();
  }, [editingDescriptionId]);

  useEffect(() => {
    if (!editing) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && saveFormRef.current?.contains(event.target)) return;
      setEditing(false);
      setName("");
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [editing]);

  useEffect(() => {
    const reload = () => {
      try { setItems(readPresets()); }
      catch { onStatus("无法读取本机预设存储，请检查 WebView2 数据目录权限。"); }
    };
    reload();
    const changed = (event: StorageEvent) => { if (!event.key || event.key.startsWith(PREFIX)) reload(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [onStatus]);

  const save = () => {
    if (!editing) { setEditing(true); return; }
    if (!name.trim()) {
      onStatus("请先给预设起一个名称。");
      inputRef.current?.focus();
      return;
    }
    try {
      const preset = { id: crypto.randomUUID(), name: name.trim(), description: "自定义材质", settings: cloneSettings(settings) };
      // Each save has its own key: same-name presets and saves from other panes never overwrite each other.
      localStorage.setItem(PREFIX + preset.id, JSON.stringify(preset));
      setItems(readPresets());
      setName("");
      setEditing(false);
      onStatus(`已保存「${preset.name}」，下次打开仍可使用。`);
    } catch { onStatus("保存失败：本机存储不可用或空间不足，当前参数仍保留在面板中。"); }
  };

  const remove = (item: UserPreset) => {
    try {
      localStorage.removeItem(PREFIX + item.id);
      setItems(readPresets());
      onStatus(`已删除「${item.name}」。`);
    } catch { onStatus("删除失败：本机预设存储不可用。"); }
  };

  const beginDescriptionEdit = (item: UserPreset) => {
    setEditingDescriptionId(item.id);
    setDescription(item.description);
  };

  const saveDescription = (item: UserPreset) => {
    const nextDescription = description.trim() || "自定义材质";
    try {
      const stored = JSON.parse(localStorage.getItem(PREFIX + item.id) ?? "null") as UserPreset | null;
      if (!stored) throw new Error("预设不存在");
      localStorage.setItem(PREFIX + item.id, JSON.stringify({ ...stored, description: nextDescription }));
      setItems(readPresets());
      setEditingDescriptionId(null);
      onStatus(`已更新「${item.name}」的说明语。`);
    } catch { onStatus("说明语保存失败：本机预设存储不可用。"); }
  };

  return <section className="user-presets">
    <div className="card-heading user-presets-heading">
      <div className="user-presets-title">
        <h2>我的预设</h2>
        <span className="preset-help" tabIndex={0} role="img" aria-label="预设保存说明">
          <span aria-hidden="true">!</span>
          <span className="preset-help-tooltip" role="tooltip">保存当前材质和亮度；同名也会另存，不覆盖内置或已有预设。</span>
        </span>
      </div>
      <div ref={saveFormRef} className={`save-preset-form ${editing ? "editing" : ""}`}>
        <input ref={inputRef} aria-label="新预设名称" aria-hidden={!editing} tabIndex={editing ? 0 : -1}
          placeholder="输入预设名称" maxLength={40} value={name}
          onChange={event => setName(event.target.value)} onKeyDown={event => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); save(); }
            if (event.key === "Escape") { setEditing(false); setName(""); }
          }} />
        <button type="button" className="primary save-preset-button" onClick={save}
          aria-label={editing ? "确认" : "保存预设"}
          title={editing ? "确认保存当前材质和亮度" : "输入名称后保存当前材质和亮度"}>
          <span className="save-preset-label" aria-hidden="true">
            <span className={editing ? "label-hidden" : ""}>保存预设</span>
            <span className={editing ? "" : "label-hidden"}>确认</span>
          </span>
        </button>
      </div>
    </div>
    {items.length > 0 && <div className="preset-grid user-preset-grid">
      {items.map(item => {
        const matchesCurrentSettings = JSON.stringify({ ...item.settings, shapeMode: settings.shapeMode, outputScale: settings.outputScale }) === JSON.stringify(settings);
        const active = activePresetId === item.id || (activePresetId === null && matchesCurrentSettings);
        return <article className={`user-preset-card ${active ? "active" : ""}`} key={item.id}>
          <button type="button" className="user-preset-apply" aria-pressed={active}
            title={`载入「${item.name}」；点击底部“应用效果”才会修改 PPT 图形`}
            onClick={() => { onApply({ ...cloneSettings(item.settings), shapeMode: settings.shapeMode }, item.id); onStatus(`已载入「${item.name}」，点击应用效果写入图形。`); }}>
            <UserPresetPreview settings={item.settings} renderer={renderer} />
            <span className="user-preset-copy"><strong>{item.name}</strong><small>{item.description}</small></span>
          </button>
          {editingDescriptionId === item.id ? <div className="user-preset-description-editor">
            <input ref={descriptionRef} className="user-preset-description-input" aria-label={`编辑预设「${item.name}」的说明语`}
              maxLength={30} value={description} onChange={event => setDescription(event.target.value)}
              onBlur={() => {
                if (skipDescriptionBlur.current) { skipDescriptionBlur.current = false; return; }
                saveDescription(item);
              }} onKeyDown={event => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); saveDescription(item); }
                if (event.key === "Escape") {
                  event.preventDefault();
                  skipDescriptionBlur.current = true;
                  setEditingDescriptionId(null);
                  setDescription("");
                }
              }} />
          </div> : <button type="button" className="user-preset-edit" aria-label={`编辑预设「${item.name}」的说明语`} title="编辑说明语"
            onClick={() => beginDescriptionEdit(item)}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.12 2.12 0 0 0-3-3L5 17z" /><path d="m13.5 7.5 3 3" /></svg></button>}
          <button type="button" className="user-preset-delete" aria-label={`删除预设「${item.name}」`} title="删除此预设"
            onClick={() => remove(item)}><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </article>;
      })}
    </div>}
  </section>;
}
