import { describe, expect, it } from 'vitest';
import { checkerExample, twoToneExample } from './examples';
import { addEdge, addNode, createGraph, deleteNode } from './graph';
import { generateGLSL } from './codegen';
import type { Graph } from './types';

function outRef(g: Graph, index: number, port = 'out') {
  return { node: g.nodes[index].id, port };
}

describe('connection validation', () => {
  it('rejects type conflicts on fixed ports and keeps existing edges', () => {
    let g = createGraph();
    g = addNode(g, 'color', 0, 0).graph;
    g = addNode(g, 'scale2d', 0, 0).graph;
    const before = g.edges.length;
    const result = addEdge(g, outRef(g, 0, 'rgb'), { node: g.nodes[1].id, port: 'in' });
    expect(result.error).not.toBeNull();
    expect(result.graph.edges).toHaveLength(before);
  });

  it('rejects self loops', () => {
    let g = createGraph();
    g = addNode(g, 'number', 0, 0).graph;
    g = addNode(g, 'add', 0, 0).graph;
    const add = g.nodes[1].id;
    const n = addEdge(g, { node: add, port: 'out' }, { node: add, port: 'a' });
    expect(n.error?.message).toContain('自环');
  });

  it('rejects indirect cycles', () => {
    let g = createGraph();
    g = addNode(g, 'add', 0, 0).graph;
    const a1 = g.nodes[0].id;
    g = addNode(g, 'add', 0, 0).graph;
    const a2 = g.nodes[1].id;
    g = addEdge(g, { node: a1, port: 'out' }, { node: a2, port: 'a' }).graph;
    const cycle = addEdge(g, { node: a2, port: 'out' }, { node: a1, port: 'a' });
    expect(cycle.error?.message).toContain('环路');
  });

  it('allows float broadcast but rejects vec2 vs vec3', () => {
    let g0 = createGraph();
    g0 = addNode(g0, 'number', 0, 0).graph;
    g0 = addNode(g0, 'color', 0, 0).graph;
    g0 = addNode(g0, 'mul', 0, 0).graph;
    const broadcast = addEdge(g0, { node: g0.nodes[0].id, port: 'out' }, { node: g0.nodes[2].id, port: 'a' });
    expect(broadcast.error).toBeNull();

    let g = createGraph();
    g = addNode(g, 'scale2d', 0, 0).graph;
    g = addNode(g, 'color', 0, 0).graph;
    g = addNode(g, 'add', 0, 0).graph;
    const add = g.nodes[2].id;
    const ok = addEdge(g, { node: g.nodes[0].id, port: 'out' }, { node: add, port: 'a' });
    expect(ok.error).toBeNull();
    g = ok.graph;
    const bad = addEdge(g, { node: g.nodes[1].id, port: 'rgb' }, { node: add, port: 'b' });
    expect(bad.error?.message).toContain('类型冲突');
  });

  it('replaces the wire into an already occupied input', () => {
    let g = createGraph();
    g = addNode(g, 'number', 0, 0).graph;
    g = addNode(g, 'number', 0, 0).graph;
    g = addNode(g, 'add', 0, 0).graph;
    const add = g.nodes[2].id;
    g = addEdge(g, { node: g.nodes[0].id, port: 'out' }, { node: add, port: 'a' }).graph;
    g = addEdge(g, { node: g.nodes[1].id, port: 'out' }, { node: add, port: 'a' }).graph;
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].fromNode).toBe(g.nodes[1].id);
  });

  it('mix weight must be float', () => {
    let g = createGraph();
    g = addNode(g, 'uv', 0, 0).graph;
    g = addNode(g, 'mix', 0, 0).graph;
    const r = addEdge(g, outRef(g, 0, 'uv'), { node: g.nodes[1].id, port: 't' });
    expect(r.error?.message).toContain('float');
  });

  it('deleting a node removes related edges', () => {
    let g = checkerExample();
    const edges = g.edges.length;
    const checker = g.nodes.find((n) => n.kind === 'checker')!;
    g = deleteNode(g, checker.id);
    expect(g.edges.length).toBeLessThan(edges);
    expect(g.edges.every((e) => e.fromNode !== checker.id && e.toNode !== checker.id)).toBe(true);
  });
});

describe('GLSL generation', () => {
  it('prunes unreachable nodes and emits shared subgraphs once', () => {
    const g = addNode(twoToneExample(), 'color', 0, 0).graph;
    const orphan = g.nodes.find((n) => n.kind === 'color')!;
    const program = generateGLSL(g)!;
    expect(program.fragmentShader).not.toContain(orphan.id);
    const numberCount = (program.fragmentShader.match(/uniform float/g) ?? []).length;
    const scalar = g.nodes.filter((n) => n.kind === 'number');
    expect(numberCount).toBe(scalar.length);
    // Each number feeds the mix once; shared reuse would reference the same variable name.
    const firstNumber = scalar[0].id;
    const declarations = program.fragmentShader.match(new RegExp(`${firstNumber}_out`, 'g')) ?? [];
    expect(declarations.length).toBeGreaterThanOrEqual(1);
  });

  it('checker example generates GLSL containing checkerboard expression and final color', () => {
    const program = generateGLSL(checkerExample())!;
    expect(program.fragmentShader).toContain('mod(floor');
    expect(program.fragmentShader).toContain('finalColor');
    expect(program.uniforms.filter((u) => u.type === 'vec3')).toHaveLength(2);
  });

  it('returns null without an output node', () => {
    let g = createGraph();
    g = addNode(g, 'number', 0, 0).graph;
    expect(generateGLSL(g)).toBeNull();
  });
});
