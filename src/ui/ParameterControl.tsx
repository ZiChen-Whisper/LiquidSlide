import { useCallback, useId, useRef } from "react";
import type { NumericParameter } from "./parameterDefinitions";

interface Props {
  definition: NumericParameter;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
}

export function InfoTip({ label, description }: { label: string; description: string }) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const updateTooltipPosition = useCallback(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const bounds = tip.getBoundingClientRect();
    const width = Math.min(230, Math.max(120, window.innerWidth - 24));
    const left = Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12));
    tip.style.setProperty("--tooltip-left", `${left}px`);
    tip.style.setProperty("--tooltip-top", `${bounds.bottom + 8}px`);
    tip.style.setProperty("--tooltip-width", `${width}px`);
  }, []);
  return <span ref={tipRef} className="info-tip" tabIndex={0} role="img" aria-label={label}
    onMouseEnter={updateTooltipPosition} onFocus={updateTooltipPosition}>
    <span aria-hidden="true">!</span>
    <span className="info-tip-tooltip" role="tooltip">{description}</span>
  </span>;
}

export function ParameterControl({ definition, value, defaultValue, onChange }: Props) {
  const inputId = useId();
  const progress = Math.max(0, Math.min(100, (value - definition.min) / (definition.max - definition.min) * 100));
  const commit = (next: number) => {
    if (!Number.isFinite(next)) return;
    onChange(Math.min(definition.max, Math.max(definition.min, next)));
  };
  return (
    <div className="parameter">
      <div className="parameter-heading">
        <span className="parameter-label"><label htmlFor={inputId}>{definition.label}</label><InfoTip label={`${definition.label}说明`} description={definition.description} /></span>
        <button className="reset-one" title="恢复默认值" aria-label={`重置${definition.label}`} onClick={() => onChange(defaultValue)} type="button">↺</button>
      </div>
      <div className="parameter-inputs">
        <input
          id={inputId}
          style={{ background: `linear-gradient(to right, #7771c1 ${progress}%, #e9e8f1 ${progress}%)` }}
          aria-label={`${definition.label}滑块`}
          type="range"
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={value}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <input
          aria-label={`${definition.label}数值`}
          className="number"
          type="number"
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={value}
          onChange={(event) => commit(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
