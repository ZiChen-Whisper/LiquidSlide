import { useId } from "react";
import type { NumericParameter } from "./parameterDefinitions";

interface Props {
  definition: NumericParameter;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
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
        <label htmlFor={inputId} title={definition.description}>{definition.label}</label>
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
      <p>{definition.description}</p>
    </div>
  );
}
