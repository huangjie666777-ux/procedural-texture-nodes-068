import { nodeDef } from './nodes';
import type { Graph, GraphNode, PortType } from './types';

export interface UniformSpec {
  name: string;
  type: 'float' | 'vec2' | 'vec3';
  value: number[];
  nodeId: string;
  keys: string[];
}

export interface GeneratedProgram {
  vertexShader: string;
  fragmentShader: string;
  uniforms: UniformSpec[];
  outputNodeId: string | null;
}

export const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

type Resolved = { expr: string; type: PortType };

function promote(expr: string, from: PortType, to: PortType): string {
  if (from === to) return expr;
  if (from === 'float' && to === 'vec2') return `vec2(${expr})`;
  if (from === 'float' && to === 'vec3') return `vec3(${expr})`;
  return expr;
}

function combineTypes(a: PortType, b: PortType): PortType {
  if (a === 'float') return b;
  if (b === 'float') return a;
  return a;
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Generate GLSL for the subgraph reachable from the output node.
 * Shared subgraphs are emitted once and referenced by variable name.
 */
export function generateGLSL(graph: Graph): GeneratedProgram | null {
  const output = graph.nodes.find((n) => n.kind === 'output');
  if (!output) return null;

  const reachable = new Set<string>();
  const collect = (nodeId: string) => {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    for (const e of graph.edges) {
      if (e.toNode === nodeId) collect(e.fromNode);
    }
  };
  collect(output.id);

  const activeNodes = graph.nodes.filter((n) => reachable.has(n.id));
  const uniforms: UniformSpec[] = [];
  const lines: string[] = [];
  const emitted = new Set<string>();
  const outTypeCache = new Map<string, PortType>();

  const inputEdge = (nodeId: string, port: string) =>
    graph.edges.find((e) => e.toNode === nodeId && e.toPort === port);

  const nodeUniform = (node: GraphNode): UniformSpec => {
    const name = `u_${sanitize(node.id)}`;
    let spec = uniforms.find((u) => u.nodeId === node.id);
    if (spec) return spec;
    if (node.kind === 'number') {
      spec = { name, type: 'float', value: [node.data.value ?? 0], nodeId: node.id, keys: ['value'] };
    } else if (node.kind === 'color') {
      spec = { name, type: 'vec3', value: [node.data.r ?? 0, node.data.g ?? 0, node.data.b ?? 0], nodeId: node.id, keys: ['r', 'g', 'b'] };
    } else {
      spec = { name, type: 'vec2', value: [node.data.sx ?? 1, node.data.sy ?? 1], nodeId: node.id, keys: ['sx', 'sy'] };
    }
    uniforms.push(spec);
    return spec;
  };

  const resolveInput = (node: GraphNode, portId: string): Resolved => {
    const def = nodeDef(node.kind).inputs.find((p) => p.id === portId)!;
    const edge = inputEdge(node.id, portId);
    if (edge) {
      emit(edge.fromNode);
      const src = graph.nodes.find((n) => n.id === edge.fromNode)!;
      const type = outputTypeOf(src);
      return { expr: `${sanitize(edge.fromNode)}_${sanitize(edge.fromPort)}`, type };
    }
    const useNodeUniform =
      (node.kind === 'scale2d' && portId === 's') || (node.kind === 'checker' && portId === 'scale');
    const literal = useNodeUniform ? nodeUniform(node).name : def.defaultLiteral;
    const type: PortType = useNodeUniform
      ? 'vec2'
      : literal === 'vUv' || literal.startsWith('vec2')
        ? 'vec2'
        : literal.startsWith('vec3')
          ? 'vec3'
          : 'float';
    return { expr: literal, type };
  };

  const outputTypeOf = (node: GraphNode): PortType => {
    const cached = outTypeCache.get(node.id);
    if (cached) return cached;
    const def = nodeDef(node.kind);
    let type: PortType = def.outputs[0]?.type ?? 'float';
    if (node.kind === 'add' || node.kind === 'mul' || node.kind === 'mix') {
      const a = resolveInput(node, 'a');
      const b = resolveInput(node, 'b');
      type = combineTypes(a.type, b.type);
    }
    outTypeCache.set(node.id, type);
    return type;
  };

  const emit = (nodeId: string) => {
    if (emitted.has(nodeId)) return;
    emitted.add(nodeId);
    const node = activeNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const def = nodeDef(node.kind);
    const outPort = def.outputs[0];
    const varName = outPort ? `${sanitize(node.id)}_${sanitize(outPort.id)}` : '';

    for (const input of def.inputs) {
      const edge = inputEdge(node.id, input.id);
      if (edge) emit(edge.fromNode);
    }

    switch (node.kind) {
      case 'number':
      case 'color':
      case 'uv': {
        const expr =
          node.kind === 'uv' ? 'vUv' : nodeUniform(node).name;
        lines.push(`  ${def.outputs[0].type} ${varName} = ${expr};`);
        break;
      }
      case 'scale2d': {
        const input = resolveInput(node, 'in');
        const scale = resolveInput(node, 's');
        lines.push(`  vec2 ${varName} = ${promote(input.expr, input.type, 'vec2')} * ${promote(scale.expr, scale.type, 'vec2')};`);
        break;
      }
      case 'checker': {
        const uv = resolveInput(node, 'uv');
        const scale = resolveInput(node, 'scale');
        lines.push(`  vec2 cp_${sanitize(node.id)} = ${promote(uv.expr, uv.type, 'vec2')} * ${promote(scale.expr, scale.type, 'vec2')};`);
        lines.push(`  float ${varName} = mod(floor(cp_${sanitize(node.id)}.x) + floor(cp_${sanitize(node.id)}.y), 2.0);`);
        break;
      }
      case 'add':
      case 'mul': {
        const a = resolveInput(node, 'a');
        const b = resolveInput(node, 'b');
        const t = combineTypes(a.type, b.type);
        const op = node.kind === 'add' ? '+' : '*';
        lines.push(`  ${t} ${varName} = ${promote(a.expr, a.type, t)} ${op} ${promote(b.expr, b.type, t)};`);
        break;
      }
      case 'mix': {
        const a = resolveInput(node, 'a');
        const b = resolveInput(node, 'b');
        const t = combineTypes(a.type, b.type);
        const factor = resolveInput(node, 't');
        lines.push(
          `  ${t} ${varName} = mix(${promote(a.expr, a.type, t)}, ${promote(b.expr, b.type, t)}, ${promote(factor.expr, factor.type, 'float')});`,
        );
        break;
      }
      case 'output': {
        const color = resolveInput(node, 'color');
        const expr = promote(color.expr, color.type, 'vec3');
        lines.push(`  vec3 finalColor = ${expr};`);
        break;
      }
    }
  };

  emit(output.id);

  const uniformDecls = uniforms.map((u) => `uniform ${u.type} ${u.name};`).join('\n');
  const fragmentShader = /* glsl */ `varying vec2 vUv;
${uniformDecls}
void main() {
${lines.join('\n')}
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

  return { vertexShader: VERTEX_SHADER, fragmentShader, uniforms, outputNodeId: output.id };
}
