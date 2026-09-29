import { defaultExample } from './examples';
import { syncCounter } from './graph';
import type { Graph } from './types';

const KEY = 'procedural-texture-nodes:v1';

export function saveGraph(graph: Graph): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(graph));
  } catch {
    // Storage may be unavailable; editing still works in memory.
  }
}

export function loadGraph(): Graph {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Graph;
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        syncCounter(parsed);
        return parsed;
      }
    }
  } catch {
    // Fall through to the default example.
  }
  return defaultExample();
}
