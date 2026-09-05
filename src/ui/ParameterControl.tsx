import type { NumericParameter } from "./parameterDefinitions";

interface Props {
  definition: NumericParameter;
  value: number;
  defaultValue: number;
  onChange: (value: number) => void;
}

export function ParameterControl({ definition, value, defaultValue, onChange }: Props) {
  const commit = (next: number) => {
    if (!Number.isFinite(next)) return;
    onChange(Math.min(definition.max, Math.max(definition.min, next)));
  };
  return (
    <div className="parameter">
      <div className="parameter-heading">
        <label title={definition.description}>{definition.label}</label>
        <button className="reset-one" title="恢复默认值" onClick={() => onChange(defaultValue)} type="button">↺</button>
      </div>
      <div className="parameter-inputs">
        <input
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
