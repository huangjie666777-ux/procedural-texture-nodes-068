import { useRef, useState } from 'react';
import { NODE_DEFS } from '../graph/nodes';
import type { Edge, GNode, Graph, PortType, RGB } from '../graph/types';
import { HEADER_HEIGHT, nodeHeight, portPosition } from './geometry';

interface Props {
  graph: Graph;
  onMoveNode: (id: string, x: number, y: number) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onConnect: (edge: Omit<Edge, 'id'>) => void;
  onParamChange: (id: string, param: string, value: number | RGB | { x: number; y: number }) => void;
}

interface PendingDrag {
  fromNode: string;
  fromPort: string;
  x: number;
  y: number;
}

const TYPE_COLORS: Record<PortType, string> = {
  float: '#f2b34c',
  vec2: '#5fd17a',
  vec3: '#e06a9a',
};

export function NodeEditor({ graph, onMoveNode, onDeleteNode, onDeleteEdge, onConnect, onParamChange }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingDrag | null>(null);
  const [moving, setMoving] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const localPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const p = localPoint(event.clientX, event.clientY);
    if (moving) {
      onMoveNode(moving.id, p.x - moving.offsetX, p.y - moving.offsetY);
    } else if (pending) {
      setPending({ ...pending, x: p.x, y: p.y });
    }
  };

  const startFromOutput = (node: GNode, portId: string) => (event: React.PointerEvent) => {
    event.stopPropagation();
    const p = localPoint(event.clientX, event.clientY);
    setPending({ fromNode: node.id, fromPort: portId, x: p.x, y: p.y });
  };

  const dropOnInput = (node: GNode, portId: string) => () => {
    if (pending) {
      onConnect({ fromNode: pending.fromNode, fromPort: pending.fromPort, toNode: node.id, toPort: portId });
      setPending(null);
    }
  };

  return (
    <div
      ref={canvasRef}
      className='node-canvas'
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        setPending(null);
        setMoving(null);
      }}
    >
      <svg className='edge-layer'>
        {graph.edges.map((edge) => {
          const from = graph.nodes.find((n) => n.id === edge.fromNode);
          const to = graph.nodes.find((n) => n.id === edge.toNode);
          if (!from || !to) return null;
          const a = portPosition(from.kind, edge.fromPort, 'out', from.x, from.y);
          const b = portPosition(to.kind, edge.toPort, 'in', to.x, to.y);
          return (
            <g key={edge.id} className='edge' onClick={() => onDeleteEdge(edge.id)}>
              <path d={wirePath(a.x, a.y, b.x, b.y)} />
            </g>
          );
        })}
        {pending && (
          <path
            className='pending-wire'
            d={(() => {
              const from = graph.nodes.find((n) => n.id === pending.fromNode)!;
              const a = portPosition(from.kind, pending.fromPort, 'out', from.x, from.y);
              return wirePath(a.x, a.y, pending.x, pending.y);
            })()}
          />
        )}
      </svg>

      {graph.nodes.map((node) => {
        const def = NODE_DEFS[node.kind];
        return (
          <div key={node.id} className='node-card' style={{ left: node.x, top: node.y, height: nodeHeight(node.kind) }}>
            <div
              className='node-header'
              onPointerDown={(event) => {
                const p = localPoint(event.clientX, event.clientY);
                setMoving({ id: node.id, offsetX: p.x - node.x, offsetY: p.y - node.y });
              }}
            >
              <span>{def.label}</span>
              <button className='node-delete' title='删除节点（同时清除关联连线）' onClick={() => onDeleteNode(node.id)}>×</button>
            </div>
            <div className='node-body'>
              {def.inputs.map((port, i) => (
                <div className='port-row' key={port.id} style={{ top: HEADER_HEIGHT + i * 26 }}>
                  <div
                    className={`port in type-${port.type} ${pending ? 'drop-target' : ''}`}
                    style={{ borderColor: TYPE_COLORS[port.type] }}
                    onPointerUp={dropOnInput(node, port.id)}
                    title={port.defaultText ? `未连接默认：${port.defaultText}` : port.type}
                  />
                  <span className='port-label in'>{port.label}</span>
                  <span className='port-type' style={{ color: TYPE_COLORS[port.type] }}>{port.type}</span>
                  {port.defaultText && <span className='port-default'>= {port.defaultText}</span>}
                </div>
              ))}
              {def.outputs.map((port, i) => (
                <div className='port-row out-row' key={port.id} style={{ top: HEADER_HEIGHT + i * 26 }}>
                  <span className='port-label out'>{port.label}</span>
                  <span className='port-type' style={{ color: TYPE_COLORS[port.type] }}>{port.type}</span>
                  <div
                    className={`port out type-${port.type}`}
                    style={{ borderColor: TYPE_COLORS[port.type] }}
                    onPointerDown={startFromOutput(node, port.id)}
                  />
                </div>
              ))}
              <ParamEditor node={node} onChange={onParamChange} />
            </div>
          </div>
        );
      })}
      <div className='canvas-hint'>从输出端口（右侧圆点）拖到输入端口连线；点击连线断开</div>
    </div>
  );
}

function wirePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function ParamEditor({ node, onChange }: { node: GNode; onChange: Props['onParamChange'] }) {
  if (node.kind === 'number') {
    return (
      <div className='param-row'>
        <label>value</label>
        <input type='range' min={0} max={1} step={0.01} value={node.params.value as number}
          onChange={(e) => onChange(node.id, 'value', Number(e.target.value))} />
        <input type='number' step={0.01} value={node.params.value as number}
          onChange={(e) => onChange(node.id, 'value', Number(e.target.value))} />
      </div>
    );
  }
  if (node.kind === 'rgb') {
    const c = node.params.color as RGB;
    const hex = `#${[c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
    return (
      <div className='param-row color-row'>
        <input type='color' value={hex} onChange={(e) => {
          const h = e.target.value;
          onChange(node.id, 'color', {
            r: parseInt(h.slice(1, 3), 16) / 255,
            g: parseInt(h.slice(3, 5), 16) / 255,
            b: parseInt(h.slice(5, 7), 16) / 255,
          });
        }} />
        <span>{hex}</span>
      </div>
    );
  }
  if (node.kind === 'scale2d') {
    const s = node.params.scale as { x: number; y: number };
    return (
      <div className='param-row vec-row'>
        <label>x</label>
        <input type='number' step={0.1} value={s.x} onChange={(e) => onChange(node.id, 'scale', { ...s, x: Number(e.target.value) })} />
        <label>y</label>
        <input type='number' step={0.1} value={s.y} onChange={(e) => onChange(node.id, 'scale', { ...s, y: Number(e.target.value) })} />
      </div>
    );
  }
  if (node.kind === 'mix') {
    return (
      <div className='param-row'>
        <label>默认 weight</label>
        <input type='number' step={0.01} value={node.params.t as number}
          onChange={(e) => onChange(node.id, 't', Number(e.target.value))} />
      </div>
    );
  }
  return null;
}
