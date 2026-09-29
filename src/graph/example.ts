import { createNode } from './graph';
import type { Edge, Graph } from './types';

let seq = 0;
function edge(fromNode: string, toNode: string, toPort: string, fromPort = 'out'): Edge {
  seq += 1;
  return { id: `e_ex${seq}`, fromNode, fromPort, toNode, toPort };
}

/** Checkerboard driving a two-color mix, with editable number/color/uniform nodes. */
export function createExampleGraph(): Graph {
  seq = 0;
  const uv = createNode('uv', 40, 60);
  const scale = createNode('scale2d', 40, 220);
  const checker = createNode('checker', 300, 120);
  const colorA = createNode('rgb', 40, 400);
  const colorB = createNode('rgb', 40, 560);
  colorA.params.color = { r: 0.95, g: 0.85, b: 0.55 };
  colorB.params.color = { r: 0.15, g: 0.35, b: 0.65 };
  const mix = createNode('mix', 560, 360);
  const numberNode = createNode('number', 300, 360);
  numberNode.params.value = 0.5;
  const output = createNode('output', 840, 360);

  const nodes = [uv, scale, checker, colorA, colorB, numberNode, mix, output];
  const edges = [
    edge(uv.id, scale.id, 'uv'),
    edge(scale.id, checker.id, 'uv'),
    edge(colorA.id, mix.id, 'a'),
    edge(colorB.id, mix.id, 'b'),
    edge(checker.id, mix.id, 't'),
    edge(mix.id, output.id, 'color'),
  ];
  return { nodes, edges };
}

const STORAGE_KEY = 'procedural-texture-graph-v1';

export function loadGraph(): Graph | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Graph;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGraph(graph: Graph): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
  } catch {
    // storage may be unavailable; editing still works
  }
}
