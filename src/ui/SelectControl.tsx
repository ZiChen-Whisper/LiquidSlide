import { useEffect, useRef, useState } from "react";

export interface SelectOption { value: string; label: string }

export function SelectControl({ value, options, onChange, ariaLabel }: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div ref={rootRef} className={`select-control ${open ? "open" : ""}`} onBlur={(event) => {
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button type="button" className="select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
      onClick={() => setOpen((current) => !current)} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault(); setOpen(true);
        }
      }}>
      <span>{selected?.label ?? ""}</span><span className="select-chevron" aria-hidden="true" />
    </button>
    <div className="select-menu" role="listbox" aria-label={ariaLabel} aria-hidden={!open} inert={!open}>
      <div className="select-menu-inner">
        {options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className="select-option" key={option.value}
          onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}
      </div>
    </div>
  </div>;
}
