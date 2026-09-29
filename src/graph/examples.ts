import { addEdge, addNode, createGraph, resetCounter, updateNodeData } from './graph';
import type { Graph } from './types';

function freshIds() {
  resetCounter();
}

export function checkerExample(): Graph {
  freshIds();
  let g = createGraph();
  const checker = addNode(g, 'checker', 60, 220).node;
  g = updateNodeData(g, checker.id, { sx: 8, sy: 8 });
  const c1 = addNode(g, 'color', 60, 40).node;
  g = updateNodeData(g, c1.id, { r: 0.95, g: 0.8, b: 0.25 });
  const c2 = addNode(g, 'color', 60, 420).node;
  g = updateNodeData(g, c2.id, { r: 0.15, g: 0.35, b: 0.7 });
  const mix = addNode(g, 'mix', 380, 200).node;
  const out = addNode(g, 'output', 680, 220).node;
  let r = addEdge(g, { node: c1.id, port: 'rgb' }, { node: mix.id, port: 'a' });
  g = r.graph;
  r = addEdge(g, { node: c2.id, port: 'rgb' }, { node: mix.id, port: 'b' });
  g = r.graph;
  r = addEdge(g, { node: checker.id, port: 'out' }, { node: mix.id, port: 't' });
  g = r.graph;
  r = addEdge(g, { node: mix.id, port: 'out' }, { node: out.id, port: 'color' });
  g = r.graph;
  return g;
}

/** UV scaled checker multiplied by a numeric value, mixed between two numeric grays. */
export function twoToneExample(): Graph {
  freshIds();
  let g = createGraph();
  const a = addNode(g, 'number', 60, 80).node;
  g = updateNodeData(g, a.id, { value: 0.15 });
  const b = addNode(g, 'number', 60, 300).node;
  g = updateNodeData(g, b.id, { value: 0.9 });
  const uv = addNode(g, 'uv', 60, 480).node;
  const scale = addNode(g, 'scale2d', 300, 420).node;
  g = updateNodeData(g, scale.id, { sx: 6, sy: 6 });
  const checker = addNode(g, 'checker', 300, 180).node;
  g = updateNodeData(g, checker.id, { sx: 4, sy: 4 });
  const mix = addNode(g, 'mix', 560, 180).node;
  const out = addNode(g, 'output', 820, 200).node;

  let r = addEdge(g, { node: a.id, port: 'out' }, { node: mix.id, port: 'a' });
  g = r.graph;
  r = addEdge(g, { node: b.id, port: 'out' }, { node: mix.id, port: 'b' });
  g = r.graph;
  r = addEdge(g, { node: uv.id, port: 'uv' }, { node: scale.id, port: 'in' });
  g = r.graph;
  r = addEdge(g, { node: scale.id, port: 'out' }, { node: checker.id, port: 'uv' });
  g = r.graph;
  r = addEdge(g, { node: checker.id, port: 'out' }, { node: mix.id, port: 't' });
  g = r.graph;
  r = addEdge(g, { node: mix.id, port: 'out' }, { node: out.id, port: 'color' });
  g = r.graph;
  return g;
}

export function defaultExample(): Graph {
  return checkerExample();
}
