import { useRef, useState } from 'react';
import { nodeDef } from '../graph/nodes';
import type { Edge, Graph, GraphNode, PortRef } from '../graph/types';
import { NodeView } from './NodeView';
import { inputPortY, outputPortY } from './layout';

interface DragPort {
  ref: PortRef;
  kind: 'in' | 'out';
  x: number;
  y: number;
}

interface Props {
  graph: Graph;
  selectedId: string | null;
  onMoveNode: (id: string, x: number, y: number) => void;
  onConnect: (from: PortRef, to: PortRef) => void;
  onDisconnectInput: (to: PortRef) => void;
  onDeleteNode: (id: string) => void;
  onSelect: (id: string | null) => void;
}

function portPoint(node: GraphNode, portId: string, kind: 'in' | 'out'): { x: number; y: number } {
  const def = nodeDef(node.kind);
  const idx = kind === 'in' ? def.inputs.findIndex((p) => p.id === portId) : def.outputs.findIndex((p) => p.id === portId);
  const y = kind === 'in' ? inputPortY(idx) : outputPortY(idx);
  return { x: node.x + (kind === 'out' ? 184 : 0), y: node.y + y };
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function NodeCanvas({ graph, selectedId, onMoveNode, onConnect, onDisconnectInput, onDeleteNode, onSelect }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragPort, setDragPort] = useState<DragPort | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const localPoint = (e: React.PointerEvent | PointerEvent) => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleHeaderDown = (e: React.PointerEvent, node: GraphNode) => {
    e.stopPropagation();
    onSelect(node.id);
    const start = localPoint(e);
    const ox = start.x - node.x;
    const oy = start.y - node.y;
    const move = (ev: PointerEvent) => {
      const p = {
        x: ev.clientX - rootRef.current!.getBoundingClientRect().left,
        y: ev.clientY - rootRef.current!.getBoundingClientRect().top,
      };
      onMoveNode(node.id, p.x - ox, p.y - oy);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handlePortDown = (e: React.PointerEvent, node: GraphNode, port: string, kind: 'in' | 'out') => {
    const p = portPoint(node, port, kind);
    setDragPort({ ref: { node: node.id, port }, kind, x: p.x, y: p.y });
    setCursor(localPoint(e));
  };

  const handleWindowMove = (e: React.PointerEvent) => {
    if (!dragPort) return;
    setCursor(localPoint(e));
  };

  const finishAt = (target: { node: string; port: string; kind: 'in' | 'out' } | null) => {
    if (dragPort) {
      if (target) {
        if (dragPort.kind === 'out' && target.kind === 'in') {
          onConnect(dragPort.ref, { node: target.node, port: target.port });
        } else if (dragPort.kind === 'in' && target.kind === 'out') {
          onConnect({ node: target.node, port: target.port }, dragPort.ref);
        }
      } else if (dragPort.kind === 'in') {
        onDisconnectInput(dragPort.ref);
      }
    }
    setDragPort(null);
  };

  const handleUp = (e: React.PointerEvent) => {
    if (!dragPort) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const dot = el?.closest('.dot') as HTMLElement | null;
    if (dot && dot.dataset.portNode) {
      finishAt({
        node: dot.dataset.portNode,
        port: dot.dataset.portId!,
        kind: dot.dataset.portKind as 'in' | 'out',
      });
    } else {
      finishAt(null);
    }
  };

  const nodeById = (id: string) => graph.nodes.find((n) => n.id === id)!;

  return (
    <div
      ref={rootRef}
      className="node-canvas"
      onPointerMove={handleWindowMove}
      onPointerUp={handleUp}
      onPointerDown={() => onSelect(null)}
    >
      <svg className="wires">
        {graph.edges.map((edge: Edge) => {
          const fromNode = nodeById(edge.fromNode);
          const toNode = nodeById(edge.toNode);
          if (!fromNode || !toNode) return null;
          const a = portPoint(fromNode, edge.fromPort, 'out');
          const b = portPoint(toNode, edge.toPort, 'in');
          return (
            <g key={edge.id} className="wire-group">
              <path className="wire-hit" d={curve(a.x, a.y, b.x, b.y)} />
              <path className="wire" d={curve(a.x, a.y, b.x, b.y)} />
            </g>
          );
        })}
        {dragPort && (
          <path
            className="wire pending"
            d={
              dragPort.kind === 'out'
                ? curve(dragPort.x, dragPort.y, cursor.x, cursor.y)
                : curve(cursor.x, cursor.y, dragPort.x, dragPort.y)
            }
          />
        )}
      </svg>
      {graph.nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          graphEdges={graph.edges}
          selected={node.id === selectedId}
          onPointerDownHeader={handleHeaderDown}
          onPortPointerDown={handlePortDown}
          onDelete={onDeleteNode}
          onSelect={onSelect}
        />
      ))}
      {graph.edges.map((edge) => {
        const fromNode = nodeById(edge.fromNode);
        const toNode = nodeById(edge.toNode);
        if (!fromNode || !toNode) return null;
        const a = portPoint(fromNode, edge.fromPort, 'out');
        const b = portPoint(toNode, edge.toPort, 'in');
        return (
          <button
            key={`del-${edge.id}`}
            className="wire-delete"
            title="点击删除连线"
            style={{ left: (a.x + b.x) / 2 - 9, top: (a.y + b.y) / 2 - 9 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDisconnectInput({ node: edge.toNode, port: edge.toPort })}
          >
            ✕
          </button>
        );
      })}
    </div>
  );
}
