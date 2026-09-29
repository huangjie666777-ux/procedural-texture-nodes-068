import { describe, expect, it } from 'vitest';
import { checkCycle, connect, deleteNode, inferTypes, pruneToOutputs, validateConnection } from './graph';
import { createExampleGraph } from './example';
import { createNode } from './graph';
import { compileGraph } from './codegen';
import type { Graph } from './types';

function connectOrThrow(graph: Graph, from: string, toNode: string, toPort: string): Graph {
  const err = validateConnection(graph, from, 'out', toNode, toPort);
  if (err) throw new Error(err.message);
  return connect(graph, { fromNode: from, fromPort: 'out', toNode, toPort });
}

describe('example graph', () => {
  it('compiles checker + two color mix', () => {
    const result = compileGraph(createExampleGraph());
    expect(result.fragmentShader).toContain('mod(floor');
    expect(result.fragmentShader).toContain('mix(');
    expect(result.uniforms.length).toBe(3);
  });

  it('infers vec3 for the mix output', () => {
    const g = createExampleGraph();
    const types = inferTypes(g)!;
    const mix = g.nodes.find((n) => n.kind === 'mix')!;
    expect(types.outputs.get(mix.id)).toBe('vec3');
  });
});

describe('connection validation', () => {
  it('rejects self loops', () => {
    const add = createNode('add', 0, 0);
    const g: Graph = { nodes: [add], edges: [] };
    expect(validateConnection(g, add.id, 'out', add.id, 'a')?.message).toContain('自环');
  });

  it('allows scalar broadcast into vec3 math', () => {
    const rgb = createNode('rgb', 0, 0);
    const num = createNode('number', 0, 0);
    const add = createNode('add', 0, 0);
    let g: Graph = { nodes: [rgb, num, add], edges: [] };
    g = connectOrThrow(g, rgb.id, add.id, 'a');
    expect(validateConnection(g, num.id, 'out', add.id, 'b')).toBeNull();
  });

  it('rejects vec2 and vec3 mixing', () => {
    const uv = createNode('uv', 0, 0);
    const rgb = createNode('rgb', 0, 0);
    const add = createNode('add', 0, 0);
    let g: Graph = { nodes: [uv, rgb, add], edges: [] };
    g = connectOrThrow(g, uv.id, add.id, 'a');
    expect(validateConnection(g, rgb.id, 'out', add.id, 'b')?.message).toContain('vec2');
  });

  it('rejects mismatched mix endpoints', () => {
    const uv = createNode('uv', 0, 0);
    const num = createNode('number', 0, 0);
    const t = createNode('number', 0, 0);
    const mix = createNode('mix', 0, 0);
    let g: Graph = { nodes: [uv, num, t, mix], edges: [] };
    g = connectOrThrow(g, uv.id, mix.id, 'a');
    expect(validateConnection(g, num.id, 'out', mix.id, 'b')?.message).toContain('同型');
  });

  it('rejects float into checker uv', () => {
    const num = createNode('number', 0, 0);
    const checker = createNode('checker', 0, 0);
    const g: Graph = { nodes: [num, checker], edges: [] };
    expect(validateConnection(g, num.id, 'out', checker.id, 'uv')?.message).toContain('vec2');
  });

  it('accepts float grayscale into output', () => {
    const num = createNode('number', 0, 0);
    const output = createNode('output', 0, 0);
    const g: Graph = { nodes: [num, output], edges: [] };
    expect(validateConnection(g, num.id, 'out', output.id, 'color')).toBeNull();
  });

  it('rejects indirect cycles', () => {
    const a = createNode('add', 0, 0);
    const b = createNode('multiply', 0, 0);
    let g: Graph = { nodes: [a, b], edges: [] };
    g = connectOrThrow(g, a.id, b.id, 'a');
    expect(validateConnection(g, b.id, 'out', a.id, 'a')?.message).toContain('环');
  });

  it('replaces existing edge on an input (at most one wire each)', () => {
    const n1 = createNode('number', 0, 0);
    const n2 = createNode('number', 0, 0);
    const add = createNode('add', 0, 0);
    let g: Graph = { nodes: [n1, n2, add], edges: [] };
    g = connectOrThrow(g, n1.id, add.id, 'a');
    g = connectOrThrow(g, n2.id, add.id, 'a');
    expect(g.edges.filter((e) => e.toNode === add.id && e.toPort === 'a')).toHaveLength(1);
  });
});

describe('graph maintenance', () => {
  it('detects cycles', () => {
    const a = createNode('add', 0, 0);
    const b = createNode('add', 0, 0);
    let g: Graph = { nodes: [a, b], edges: [] };
    g = connectOrThrow(g, a.id, b.id, 'a');
    g = { ...g, edges: [...g.edges, { id: 'x', fromNode: b.id, fromPort: 'out', toNode: a.id, toPort: 'b' }] };
    expect(checkCycle(g)).not.toBeNull();
  });

  it('deleting a node removes related edges', () => {
    const g0 = createExampleGraph();
    const checker = g0.nodes.find((n) => n.kind === 'checker')!;
    const g = deleteNode(g0, checker.id);
    expect(g.edges.some((e) => e.fromNode === checker.id || e.toNode === checker.id)).toBe(false);
  });

  it('prunes nodes unrelated to the output', () => {
    const g0 = createExampleGraph();
    const stray = createNode('number', 0, 0);
    const g = pruneToOutputs({ nodes: [...g0.nodes, stray], edges: g0.edges }).graph;
    expect(g.nodes.some((n) => n.id === stray.id)).toBe(false);
  });
});

describe('shared subgraphs', () => {
  it('emits a shared upstream node once', () => {
    const num = createNode('number', 0, 0);
    const a1 = createNode('add', 0, 0);
    const a2 = createNode('add', 0, 0);
    const mul = createNode('multiply', 0, 0);
    const output = createNode('output', 0, 0);
    let g: Graph = { nodes: [num, a1, a2, mul, output], edges: [] };
    g = connectOrThrow(g, num.id, a1.id, 'a');
    g = connectOrThrow(g, num.id, a2.id, 'a');
    g = connectOrThrow(g, a1.id, mul.id, 'a');
    g = connectOrThrow(g, a2.id, mul.id, 'b');
    g = connectOrThrow(g, mul.id, output.id, 'color');
    const result = compileGraph(g);
    const occurrences = result.orderedNodeIds.filter((id) => id === num.id).length;
    expect(occurrences).toBe(1);
  });
});
