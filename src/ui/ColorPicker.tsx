import { useEffect, useMemo, useRef, useState } from "react";
import type { RgbaColor } from "../domain/types";

type PickerMode = "hex" | "rgb";
type RgbColor = Pick<RgbaColor, "r" | "g" | "b">;

const COLOR_PALETTE = [
  "#ffffff", "#f3f4f7", "#dfe2e8", "#c2c7d2", "#9aa3b3", "#737d8e", "#4b5565", "#222833",
  "#fff1f0", "#ffd9d6", "#ffb4ad", "#f78378", "#e34f48", "#bd302b", "#861d20", "#50151a",
  "#fff4df", "#ffe2ae", "#ffc76d", "#f2a43a", "#d57b19", "#a9550d", "#74350b", "#421f0b",
  "#fffbd8", "#f6f39b", "#d8df63", "#aabf42", "#799b32", "#52752c", "#36582a", "#203d25",
  "#e7faef", "#b9efd0", "#78d6aa", "#3eba83", "#208f68", "#146b56", "#0d4d45", "#0a3030",
  "#e5f4ff", "#b6e0fb", "#72bee9", "#3e93cf", "#2670b4", "#20518b", "#1c3868", "#172749",
  "#f0eaff", "#d9c9ff", "#b49cec", "#9072d1", "#6e4eb3", "#51368d", "#392766", "#261d45"
];

function clampByte(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function toHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b].map((channel) => clampByte(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

function fromHex(value: string): RgbColor | null {
  const raw = value.trim().replace(/^#/, "");
  const expanded = raw.length === 3 ? raw.split("").map((channel) => channel + channel).join("") : raw;
  if (!/^[\da-f]{6}$/i.test(expanded)) return null;
  const number = Number.parseInt(expanded, 16);
  return { r: ((number >> 16) & 255) / 255, g: ((number >> 8) & 255) / 255, b: (number & 255) / 255 };
}

function fromBytes(red: string, green: string, blue: string): RgbColor | null {
  if (!/^\d{1,3}$/.test(red) || !/^\d{1,3}$/.test(green) || !/^\d{1,3}$/.test(blue)) return null;
  return { r: clampByte(Number(red)) / 255, g: clampByte(Number(green)) / 255, b: clampByte(Number(blue)) / 255 };
}

export function ColorPicker({ value, onChange, disabled = false }: { value: RgbaColor; onChange: (value: RgbColor) => void; disabled?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PickerMode>("hex");
  const [hexDraft, setHexDraft] = useState(toHex(value));
  const [rgbDraft, setRgbDraft] = useState({
    r: String(clampByte(value.r * 255)),
    g: String(clampByte(value.g * 255)),
    b: String(clampByte(value.b * 255))
  });
  const currentHex = useMemo(() => toHex(value), [value.r, value.g, value.b]);

  useEffect(() => {
    setHexDraft(currentHex);
    setRgbDraft({ r: String(clampByte(value.r * 255)), g: String(clampByte(value.g * 255)), b: String(clampByte(value.b * 255)) });
  }, [currentHex, value.r, value.g, value.b]);

  useEffect(() => {
    const closeWhenOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selectColor = (color: RgbColor) => {
    onChange(color);
    setHexDraft(toHex(color));
    setRgbDraft({ r: String(clampByte(color.r * 255)), g: String(clampByte(color.g * 255)), b: String(clampByte(color.b * 255)) });
  };

  const changeHex = (next: string) => {
    const normalized = next.startsWith("#") ? next : `#${next}`;
    setHexDraft(normalized);
    const color = fromHex(normalized);
    if (color) selectColor(color);
  };

  const changeRgb = (channel: "r" | "g" | "b", next: string) => {
    if (!/^\d{0,3}$/.test(next)) return;
    const nextDraft = { ...rgbDraft, [channel]: next };
    setRgbDraft(nextDraft);
    const color = fromBytes(nextDraft.r, nextDraft.g, nextDraft.b);
    if (color) selectColor(color);
  };

  const restoreRgbField = (channel: "r" | "g" | "b") => {
    if (rgbDraft[channel] !== "") return;
    setRgbDraft((current) => ({ ...current, [channel]: String(clampByte(value[channel] * 255)) }));
  };

  return <div ref={root} className={`color-picker ${open ? "open" : ""}`}>
    <button
      type="button"
      className="color-control"
      aria-label="打开玻璃颜色选择器"
      aria-expanded={open}
      aria-haspopup="dialog"
      title="打开玻璃颜色选择器"
      disabled={disabled}
      style={{ backgroundColor: currentHex }}
      onClick={() => setOpen((current) => !current)}
    />
    <div className="color-picker-menu" role="dialog" aria-label="玻璃颜色选择器">
      <div className="color-picker-heading"><strong>玻璃颜色</strong><span>{currentHex.toUpperCase()}</span></div>
      <div className={`color-picker-tabs ${mode}`} role="tablist" aria-label="颜色输入模式">
        <button type="button" role="tab" aria-selected={mode === "hex"} className={mode === "hex" ? "active" : ""} onClick={() => setMode("hex")}>HEX</button>
        <button type="button" role="tab" aria-selected={mode === "rgb"} className={mode === "rgb" ? "active" : ""} onClick={() => setMode("rgb")}>RGB</button>
      </div>
      {mode === "hex" ? <label className="color-input-row"><span>HEX</span><input value={hexDraft} maxLength={7} spellCheck={false} onChange={(event) => changeHex(event.target.value)} onBlur={() => setHexDraft(currentHex)} /></label> :
        <div className="color-rgb-fields">
          {(["r", "g", "b"] as const).map((channel) => <label key={channel}><span>{channel.toUpperCase()}</span><input inputMode="numeric" value={rgbDraft[channel]} maxLength={3} aria-label={`RGB ${channel.toUpperCase()}`} onChange={(event) => changeRgb(channel, event.target.value)} onBlur={() => restoreRgbField(channel)} /></label>)}
        </div>}
      <div className="color-palette-heading"><span>色盘</span><small>点击颜色即可应用</small></div>
      <div className="color-swatch-grid">
        {COLOR_PALETTE.map((color) => <button key={color} type="button" className={`color-swatch ${color === currentHex ? "active" : ""}`} style={{ backgroundColor: color }} aria-label={`选择颜色 ${color}`} title={color} onClick={() => selectColor(fromHex(color) as RgbColor)} />)}
      </div>
    </div>
  </div>;
}
