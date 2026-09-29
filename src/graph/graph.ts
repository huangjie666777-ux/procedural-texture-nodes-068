import { NODE_DEFS, nodeDef } from './nodes';
import type {
  Edge,
  Graph,
  GraphError,
  GraphNode,
  NodeKind,
  PortType,
  PortRef,
} from './types';

let counter = 1;

function uid(prefix: string): string {
  return `${prefix}${counter++}`;
}

/** Restore counter when loading persisted graphs. */
export function syncCounter(graph: Graph): void {
  for (const n of graph.nodes) {
    const m = /^n(\d+)$/.exec(n.id);
    if (m) counter = Math.max(counter, Number(m[1]) + 1);
  }
  counter = Math.max(counter, graph.nextId);
}

/** Reset id counters (used when creating fresh example graphs). */
export function resetCounter(): void {
  counter = 1;
}

export function createGraph(): Graph {
  return { nodes: [], edges: [], nextId: 1 };
}

export function addNode(graph: Graph, kind: NodeKind, x = 80, y = 80): { graph: Graph; node: GraphNode } {
  const def = NODE_DEFS[kind];
  const id = uid('n');
  const node: GraphNode = {
    id,
    kind,
    x: Math.round(x),
    y: Math.round(y),
    data: { ...def.data },
  };
  graph.nodes.push(node);
  return {
    graph: { ...graph, nodes: [...graph.nodes], nextId: Math.max(graph.nextId, counter) },
    node,
  };
}

export function moveNode(graph: Graph, id: string, x: number, y: number): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)),
  };
}

export function updateNodeData(graph: Graph, id: string, data: Record<string, number>): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
  };
}

export function deleteNode(graph: Graph, id: string): Graph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.fromNode !== id && e.toNode !== id),
  };
}

export function disconnectInput(graph: Graph, to: PortRef): Graph {
  return {
    ...graph,
    edges: graph.edges.filter((e) => !(e.toNode === to.node && e.toPort === to.port)),
  };
}

export function findInputEdge(graph: Graph, to: PortRef): Edge | undefined {
  return graph.edges.find((e) => e.toNode === to.node && e.toPort === to.port);
}

export function getNode(graph: Graph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

function outputType(graph: Graph, ref: PortRef): PortType | undefined {
  const node = getNode(graph, ref.node);
  if (!node) return undefined;
  const out = nodeDef(node.kind).outputs.find((p) => p.id === ref.port);
  return out?.type;
}

function isFloat(t: PortType): boolean {
  return t === 'float';
}

/** Returns null when compatible, otherwise a Chinese error message. */
export function checkConnection(graph: Graph, from: PortRef, to: PortRef): string | null {
  if (from.node === to.node) return '不能连接同一节点（自环）';
  const fromNode = getNode(graph, from.node);
  const toNode = getNode(graph, to.node);
  if (!fromNode || !toNode) return '端口不存在';
  const outDef = nodeDef(fromNode.kind).outputs.find((p) => p.id === from.port);
  const inDef = nodeDef(toNode.kind).inputs.find((p) => p.id === to.port);
  if (!outDef || !inDef) return '端口不存在';
  const outType = outDef.type;

  if (inDef.type !== 'any' && inDef.type !== outType) {
    return `类型冲突：输出 ${outType} 不能接入需要 ${inDef.type} 的输入`;
  }
  if (toNode.kind === 'mix' && to.port === 't' && !isFloat(outType)) {
    return `混合权重必须为 float，收到 ${outType}`;
  }
  if (toNode.kind === 'add' || toNode.kind === 'mul') {
    const otherPort = to.port === 'a' ? 'b' : 'a';
    const otherEdge = graph.edges.find((e) => e.toNode === to.node && e.toPort === otherPort);
    if (otherEdge) {
      const otherType = outputType(graph, { node: otherEdge.fromNode, port: otherEdge.fromPort });
      if (otherType && otherType !== outType && !isFloat(otherType) && !isFloat(outType)) {
        return `类型冲突：${otherType} 与 ${outType} 不能直接相加/相乘（仅允许标量广播）`;
      }
    }
  }
  if (createsCycle(graph, from, to)) return '连接会形成间接环路';
  return null;
}

/** DFS along existing data flow: edge from->to closes a cycle if to already reaches from. */
function createsCycle(graph: Graph, from: PortRef, to: PortRef): boolean {
  const stack = [to.node];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from.node) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of graph.edges) {
      if (e.fromNode === cur) stack.push(e.toNode);
    }
  }
  return false;
}

export interface AddEdgeResult {
  graph: Graph;
  error: GraphError | null;
}

/** Add or replace the wire into an input. Rejected candidates leave edges unchanged. */
export function addEdge(graph: Graph, from: PortRef, to: PortRef): AddEdgeResult {
  const message = checkConnection(graph, from, to);
  if (message) {
    return { graph, error: { nodeId: to.node, portId: to.port, message } };
  }
  const id = uid('e');
  const edges = [
    ...graph.edges.filter((e) => !(e.toNode === to.node && e.toPort === to.port)),
    { id, fromNode: from.node, fromPort: from.port, toNode: to.node, toPort: to.port },
  ];
  return { graph: { ...graph, edges }, error: null };
}

export function removeEdge(graph: Graph, id: string): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

/** Validate the whole graph (polymorphic inputs etc.). */
export function validateGraph(graph: Graph): GraphError[] {
  const errors: GraphError[] = [];
  for (const e of graph.edges) {
    const msg = checkConnection(graph, { node: e.fromNode, port: e.fromPort }, { node: e.toNode, port: e.toPort });
    if (msg) errors.push({ nodeId: e.toNode, portId: e.toPort, message: msg });
  }
  const outputs = graph.nodes.filter((n) => n.kind === 'output');
  if (outputs.length === 0) {
    errors.push({ nodeId: '', message: '缺少颜色输出节点' });
  }
  if (outputs.length > 1) {
    for (const n of outputs.slice(1)) {
      errors.push({ nodeId: n.id, message: '颜色输出节点只能有一个' });
    }
  }
  return errors;
}
