import { NODE_DEFS } from './nodes';
import { inferTypes, incomingEdge, pruneToOutputs } from './graph';
import type { GNode, Graph, PortType, RGB } from './types';

export interface UniformSpec {
  name: string;
  type: 'float' | 'vec3' | 'vec2';
  nodeId: string;
  param: string;
}

export interface CompileResult {
  vertexShader: string;
  fragmentShader: string;
  uniforms: UniformSpec[];
  orderedNodeIds: string[];
  glslPreview: string;
}

export function compileGraph(input: Graph): CompileResult {
  const { graph, output } = pruneToOutputs(input);
  if (!output) {
    throw new Error('图中没有颜色输出节点');
  }
  const inferred = inferTypes(graph);
  if (!inferred) throw new Error('图中存在环，无法生成代码');

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const order = topoSort(graph);
  const uniforms: UniformSpec[] = [];
  const body: string[] = [];
  const varOf = (nodeId: string, port = 'out') => `v_${nodeId.replace(/[^a-zA-Z0-9]/g, '_')}_${port}`;

  const typeOf = (nodeId: string): PortType => {
    const t = inferred.outputs.get(nodeId);
    if (!t) throw new Error(`节点 ${nodeId} 的输出类型无法推导（可能存在类型冲突）`);
    return t;
  };

  const sourceExpr = (node: GNode, portId: string, expected: PortType): string => {
    const edge = incomingEdge(graph, node.id, portId);
    if (!edge) return defaultExpr(node, portId, expected);
    const src = nodeById.get(edge.fromNode);
    if (!src) return defaultExpr(node, portId, expected);
    const srcType = typeOf(src.id);
    const raw = varOf(src.id, edge.fromPort);
    return cast(raw, srcType, expected);
  };

  const defaultExpr = (node: GNode, portId: string, expected: PortType): string => {
    if (node.kind === 'checker' || node.kind === 'scale2d') {
      if (portId === 'uv') return 'vUv';
    }
    if (node.kind === 'scale2d' && portId === 'scale') {
      return uniformName(node, 'scale', 'vec2');
    }
    if (node.kind === 'mix' && portId === 't') {
      return uniformName(node, 't', 'float');
    }
    if (node.kind === 'add') return expected === 'float' ? '0.0' : `${expected}(0.0)`;
    if (node.kind === 'multiply') return expected === 'float' ? '1.0' : `${expected}(1.0)`;
    if (node.kind === 'output') return 'vec3(0.5)';
    return expected === 'float' ? '0.0' : `${expected}(0.0)`;
  };

  const uniformName = (node: GNode, param: string, type: UniformSpec['type']): string => {
    const name = `u_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}_${param}`;
    if (!uniforms.some((u) => u.name === name)) {
      uniforms.push({ name, type, nodeId: node.id, param });
    }
    return name;
  };

  for (const id of order) {
    const node = nodeById.get(id)!;
    if (node.kind === 'output') continue;
    const outPort = NODE_DEFS[node.kind].outputs[0];
    const lhs = `${typeOf(id)} ${varOf(id, outPort.id)}`;
    let rhs = '';
    switch (node.kind) {
      case 'number':
        rhs = uniformName(node, 'value', 'float');
        break;
      case 'rgb':
        rhs = uniformName(node, 'color', 'vec3');
        break;
      case 'uv':
        rhs = 'vUv';
        break;
      case 'scale2d': {
        const uv = sourceExpr(node, 'uv', 'vec2');
        const scale = sourceExpr(node, 'scale', 'vec2');
        rhs = `${uv} * ${scale}`;
        break;
      }
      case 'checker': {
        const uv = sourceExpr(node, 'uv', 'vec2');
        rhs = `mod(floor(${uv}.x) + floor(${uv}.y), 2.0)`;
        break;
      }
      case 'add':
      case 'multiply': {
        const op = node.kind === 'add' ? '+' : '*';
        const outT = typeOf(id);
        const a = sourceExpr(node, 'a', outT);
        const b = sourceExpr(node, 'b', outT);
        rhs = `${a} ${op} ${b}`;
        break;
      }
      case 'mix': {
        const outT = typeOf(id);
        const a = sourceExpr(node, 'a', outT);
        const b = sourceExpr(node, 'b', outT);
        const t = sourceExpr(node, 't', 'float');
        rhs = `mix(${a}, ${b}, ${t})`;
        break;
      }
    }
    body.push(`  ${lhs} = ${rhs};`);
  }

  const outColor = sourceExpr(output, 'color', 'vec3');
  const uniformDecls = uniforms.map((u) => `uniform ${u.type} ${u.name};`).join('\n');
  const fragmentShader = `precision highp float;
${uniformDecls}
varying vec2 vUv;
void main() {
${body.join('\n')}
  vec3 color = ${outColor};
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
  const vertexShader = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
  const glslPreview = `// 自动生成：从颜色输出裁剪后的依赖图（${order.length} 个节点，共享子图只生成一次）\n${fragmentShader}`;
  return { vertexShader, fragmentShader, uniforms, orderedNodeIds: order, glslPreview };
}

function cast(expr: string, from: PortType, to: PortType): string {
  if (from === to) return expr;
  if (to === 'vec3' && from === 'float') return `vec3(${expr})`;
  if (to === 'vec2' && from === 'float') return `vec2(${expr})`;
  throw new Error(`类型冲突：无法把 ${from} 转换为 ${to}`);
}

export function topoSort(graph: Graph): string[] {
  const indeg = new Map<string, number>();
  for (const n of graph.nodes) indeg.set(n.id, 0);
  for (const e of graph.edges) indeg.set(e.toNode, (indeg.get(e.toNode) ?? 0) + 1);
  const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const result: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);
    for (const e of graph.edges) {
      if (e.fromNode !== id) continue;
      const d = (indeg.get(e.toNode) ?? 0) - 1;
      indeg.set(e.toNode, d);
      if (d === 0) queue.push(e.toNode);
    }
  }
  return result;
}

export function readUniformValue(node: GNode, param: string, type: UniformSpec['type']) {
  const value = node.params[param];
  if (type === 'float') return typeof value === 'number' ? value : 0;
  if (type === 'vec3') {
    const c = value as RGB | undefined;
    return c ? [c.r, c.g, c.b] : [0, 0, 0];
  }
  const c = value as { x: number; y: number } | undefined;
  return c ? [c.x, c.y] : [1, 1];
}
