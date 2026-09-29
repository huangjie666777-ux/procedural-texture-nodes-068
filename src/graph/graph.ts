import { NODE_DEFS, outputType } from './nodes';
import type { Edge, GNode, Graph, PortType } from './types';

let idCounter = 1;
export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

export function createNode(kind: GNode['kind'], x: number, y: number): GNode {
  return {
    id: uid('n'),
    kind,
    x,
    y,
    params: JSON.parse(JSON.stringify(NODE_DEFS[kind].defaultParams)),
  };
}

export function incomingEdges(graph: Graph, nodeId: string): Edge[] {
  return graph.edges.filter((e) => e.toNode === nodeId);
}

export function incomingEdge(graph: Graph, nodeId: string, portId: string): Edge | undefined {
  return graph.edges.find((e) => e.toNode === nodeId && e.toPort === portId);
}

export interface InferredTypes {
  outputs: Map<string, PortType>;
  inputs: Map<string, PortType | null>;
}

/**
 * Infer every connected input port type and each node output type.
 * Returns null if a cycle prevents stable inference. Call checkCycles first
 * for a better error message.
 */
export function inferTypes(graph: Graph): InferredTypes | null {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const outTypes = new Map<string, PortType>();
  const inTypes = new Map<string, PortType | null>();
  const state = new Map<string, 0 | 1 | 2>();

  const visit = (node: GNode): PortType | null | undefined => {
    const mark = state.get(node.id) ?? 0;
    if (mark === 1) return undefined; // cycle marker
    if (mark === 2) return outTypes.get(node.id) ?? null;
    state.set(node.id, 1);

    const def = NODE_DEFS[node.kind];
    const inputResolved = def.inputs.map((port): PortType | null => {
      const edge = incomingEdge(graph, node.id, port.id);
      if (!edge) return null;
      const source = nodeById.get(edge.fromNode);
      if (!source) return null;
      const sourceType = visit(source);
      if (sourceType === undefined) return null;
      const t = sourceType ?? null;
      inTypes.set(`${node.id}:${port.id}`, t);
      return t;
    });

    state.set(node.id, 2);
    const t = outputType(node.kind, inputResolved);
    if (t) {
      outTypes.set(node.id, t);
      for (const port of def.outputs) outTypes.set(`${node.id}:${port.id}`, t);
    }
    return t;
  };

  for (const node of graph.nodes) {
    if (visit(node) === undefined) return null;
  }
  return { outputs: outTypes, inputs: inTypes };
}

export interface ConnectionError {
  message: string;
  toPort: string;
  fromPort: string;
}

/** Returns an error (without mutating the graph) if the proposed edge is invalid. */
export function validateConnection(
  graph: Graph,
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
): ConnectionError | null {
  const source = graph.nodes.find((n) => n.id === fromNode);
  const target = graph.nodes.find((n) => n.id === toNode);
  if (!source || !target) return { message: '端口不存在', fromPort: `${fromNode}:${fromPort}`, toPort: `${toNode}:${toPort}` };
  const outDef = NODE_DEFS[source.kind].outputs.find((p) => p.id === fromPort);
  const inDef = NODE_DEFS[target.kind].inputs.find((p) => p.id === toPort);
  if (!outDef || !inDef) return { message: '端口不存在', fromPort: `${fromNode}:${fromPort}`, toPort: `${toNode}:${toPort}` };

  if (fromNode === toNode) {
    return { message: '不能连接到节点自身（自环）', fromPort: `${fromNode}:${fromPort}`, toPort: `${toNode}:${toPort}` };
  }

  // Build the tentative graph: an input accepts at most one edge, so the new
  // edge replaces any edge currently plugged into the target input.
  const tentative: Graph = {
    ...graph,
    edges: [
      ...graph.edges.filter((e) => !(e.toNode === toNode && e.toPort === toPort)),
      { id: '__candidate__', fromNode, fromPort, toNode, toPort },
    ],
  };
  if (reaches(tentative, toNode, fromNode)) {
    return { message: '连接会形成间接环', fromPort: `${fromNode}:${fromPort}`, toPort: `${toNode}:${toPort}` };
  }
  const inferred = inferTypes(tentative);
  if (!inferred) {
    return { message: '连接会形成环', fromPort: `${fromNode}:${fromPort}`, toPort: `${toNode}:${toPort}` };
  }
  const fromType = inferred?.outputs.get(`${fromNode}:${fromPort}`);
  if (!fromType) {
    return { message: '类型冲突：运算分量类型不兼容（vec2 与 vec3 不能混合）', fromPort: `${fromNode}:${fromPort}`, toPort: `${toNode}:${toPort}` };
  }

  const err = semanticCheck(tentative, inferred);
  return err;
}

/** Validate every connection against node semantics; returns the first offending port pair. */
export function semanticCheck(graph: Graph, inferred: InferredTypes): ConnectionError | null {
  for (const edge of graph.edges) {
    const target = graph.nodes.find((n) => n.id === edge.toNode);
    if (!target) continue;
    const sourceType = inferred.outputs.get(`${edge.fromNode}:${edge.fromPort}`);
    if (!sourceType) {
      return { message: '类型冲突：源节点输出类型无法推导', fromPort: `${edge.fromNode}:${edge.fromPort}`, toPort: `${edge.toNode}:${edge.toPort}` };
    }
    const fail = (message: string): ConnectionError => ({
      message,
      fromPort: `${edge.fromNode}:${edge.fromPort}`,
      toPort: `${edge.toNode}:${edge.toPort}`,
    });
    switch (target.kind) {
      case 'checker':
      case 'scale2d':
        if (edge.toPort === 'uv' && sourceType !== 'vec2') return fail(`类型冲突：UV 输入要求 vec2，收到 ${sourceType}`);
        if (edge.toPort === 'scale' && sourceType !== 'vec2') return fail(`类型冲突：scale 输入要求 vec2，收到 ${sourceType}`);
        break;
      case 'mix':
        if (edge.toPort === 't' && sourceType !== 'float') return fail(`类型冲突：混合权重要求 float，收到 ${sourceType}`);
        if (edge.toPort === 'a' || edge.toPort === 'b') {
          const otherPort = edge.toPort === 'a' ? 'b' : 'a';
          const other = incomingEdge(graph, target.id, otherPort);
          if (other) {
            const otherType = inferred.outputs.get(`${other.fromNode}:${other.fromPort}`);
            if (otherType && otherType !== sourceType) {
              return fail(`类型冲突：混合两端必须同型（${sourceType} vs ${otherType}）`);
            }
          }
        }
        break;
      case 'output':
        if (sourceType !== 'vec3' && sourceType !== 'float') return fail('类型冲突：颜色输出只接受 vec3 或 float');
        break;
      case 'add':
      case 'multiply': {
        const outT = inferred.outputs.get(target.id);
        if (!outT) return fail('类型冲突：标量只能广播到同型分量，vec2 与 vec3 不能混合');
        break;
      }
      default:
        break;
    }
  }
  return null;
}

/** True when `fromId` can reach `toId` following edges upstream. */
function reaches(graph: Graph, fromId: string, toId: string): boolean {
  const stack = [fromId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === toId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const e of graph.edges) {
      if (e.fromNode === cur) stack.push(e.toNode);
    }
  }
  return false;
}

export function checkCycle(graph: Graph): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfs = (id: string): boolean => {
    state.set(id, 1);
    stack.push(id);
    for (const e of graph.edges) {
      if (e.fromNode !== id) continue;
      const mark = state.get(e.toNode) ?? 0;
      if (mark === 1) {
        stack.push(e.toNode);
        return true;
      }
      if (mark === 0 && dfs(e.toNode)) return true;
    }
    state.set(id, 2);
    stack.pop();
    return false;
  };
  for (const n of graph.nodes) {
    if ((state.get(n.id) ?? 0) === 0 && dfs(n.id)) return stack.slice();
  }
  return null;
}

/** Add edge, replacing any existing edge on the target input. Assumes validation passed. */
export function connect(graph: Graph, edge: Omit<Edge, 'id'>): Graph {
  const edges = graph.edges.filter(
    (e) => !(e.toNode === edge.toNode && e.toPort === edge.toPort),
  );
  edges.push({ ...edge, id: uid('e') });
  return { ...graph, edges };
}

export function deleteNode(graph: Graph, nodeId: string): Graph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId),
  };
}

export function deleteEdge(graph: Graph, edgeId: string): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

/** Keep only nodes that contribute to an output node (directly or indirectly). */
export function pruneToOutputs(graph: Graph): { graph: Graph; output: GNode | null } {
  const outputs = graph.nodes.filter((n) => n.kind === 'output');
  const output = outputs[0] ?? null;
  if (!output) return { graph: { nodes: [], edges: [] }, output: null };
  const keep = new Set<string>([output.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of graph.edges) {
      if (keep.has(e.toNode) && !keep.has(e.fromNode)) {
        keep.add(e.fromNode);
        changed = true;
      }
    }
  }
  return {
    graph: {
      nodes: graph.nodes.filter((n) => keep.has(n.id)),
      edges: graph.edges.filter((e) => keep.has(e.fromNode) && keep.has(e.toNode)),
    },
    output,
  };
}
