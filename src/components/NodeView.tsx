import { TYPE_COLORS, TYPE_LABELS, nodeDef } from '../graph/nodes';
import type { Edge, GraphNode } from '../graph/types';
import { HEADER_H, NODE_WIDTH } from './layout';

interface Props {
  node: GraphNode;
  graphEdges: Edge[];
  selected: boolean;
  onPointerDownHeader: (e: React.PointerEvent, node: GraphNode) => void;
  onPortPointerDown: (e: React.PointerEvent, node: GraphNode, port: string, kind: 'in' | 'out') => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

export function NodeView({ node, graphEdges, selected, onPointerDownHeader, onPortPointerDown, onDelete, onSelect }: Props) {
  const def = nodeDef(node.kind);
  const height = HEADER_H + Math.max(def.inputs.length, def.outputs.length) * 28 + 10;
  return (
    <div
      className={`node ${selected ? 'selected' : ''}`}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, minHeight: height }}
      onPointerDown={() => onSelect(node.id)}
    >
      <div
        className="node-header"
        onPointerDown={(e) => onPointerDownHeader(e, node)}
      >
        <span>{def.title}</span>
        <button
          className="node-x"
          title="删除节点（同时删除关联连线）"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(node.id)}
        >
          ×
        </button>
      </div>
      <div className="node-body">
        {def.inputs.map((p, i) => {
          const edge = graphEdges.find((e) => e.toNode === node.id && e.toPort === p.id);
          return (
            <div className="port-row" key={p.id} style={{ top: 36 + i * 28 }}>
              <span
                className="dot in"
                data-port-node={node.id}
                data-port-id={p.id}
                data-port-kind="in"
                style={{ background: TYPE_COLORS[p.type === 'any' ? 'float' : p.type], borderColor: TYPE_COLORS[p.type === 'any' ? 'float' : p.type] }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPortPointerDown(e, node, p.id, 'in');
                }}
              />
              <span className="port-name">{p.name}</span>
              <span className="port-meta">
                <em className={p.type === 'any' ? 'poly' : ''}>{p.type === 'any' ? '同型' : TYPE_LABELS[p.type]}</em>
                {!edge && <small title="未连接时的默认值">默认 {p.defaultLabel}</small>}
              </span>
            </div>
          );
        })}
        {def.outputs.map((p, i) => (
          <div className="port-row out" key={p.id} style={{ top: 36 + i * 28 }}>
            <span className="port-name">{p.name}</span>
            <em className="type-badge" style={{ color: TYPE_COLORS[p.type] }}>{TYPE_LABELS[p.type]}</em>
            <span
              className="dot out"
              data-port-node={node.id}
              data-port-id={p.id}
              data-port-kind="out"
              style={{ background: TYPE_COLORS[p.type], borderColor: TYPE_COLORS[p.type] }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onPortPointerDown(e, node, p.id, 'out');
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
