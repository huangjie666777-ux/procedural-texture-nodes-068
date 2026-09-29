import { nodeDef } from '../graph/nodes';
import type { GraphNode } from '../graph/types';

interface Props {
  node: GraphNode | null;
  onData: (id: string, data: Record<string, number>) => void;
}

function NumberRow({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <label className="inspect-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input className="num-input" type="number" value={Number(value.toFixed(3))} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Inspector({ node, onData }: Props) {
  if (!node) {
    return <div className="inspector empty">未选中节点。点击节点标题可拖动，按住端口圆点拖线；把输入端口拖到空白处可断开。</div>;
  }
  const def = nodeDef(node.kind);
  return (
    <div className="inspector">
      <h3>{def.title}</h3>
      <p className="muted">参数以 uniform 传入，调节不会重编译着色器。</p>
      {node.kind === 'number' && (
        <NumberRow label="value" value={node.data.value ?? 0} min={0} max={2} step={0.01} onChange={(v) => onData(node.id, { value: v })} />
      )}
      {node.kind === 'color' && (
        <>
          <div className="color-line">
            <input
              type="color"
              value={toHex(node.data.r, node.data.g, node.data.b)}
              onChange={(e) => {
                const { r, g, b } = fromHex(e.target.value);
                onData(node.id, { r, g, b });
              }}
            />
            <code>{toHex(node.data.r, node.data.g, node.data.b)}</code>
          </div>
          {(['r', 'g', 'b'] as const).map((k) => (
            <NumberRow key={k} label={k} value={node.data[k] ?? 0} min={0} max={1} step={0.01} onChange={(v) => onData(node.id, { [k]: v })} />
          ))}
        </>
      )}
      {(node.kind === 'scale2d' || node.kind === 'checker') && (
        <>
          <NumberRow label="scale X" value={node.data.sx ?? 1} min={0.1} max={32} step={0.1} onChange={(v) => onData(node.id, { sx: v })} />
          <NumberRow label="scale Y" value={node.data.sy ?? 1} min={0.1} max={32} step={0.1} onChange={(v) => onData(node.id, { sy: v })} />
        </>
      )}
      {(node.kind === 'uv' || node.kind === 'add' || node.kind === 'mul' || node.kind === 'mix' || node.kind === 'output') && (
        <p className="muted">此节点无可调参数，输入默认值见节点上的标注。</p>
      )}
    </div>
  );
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function fromHex(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}
