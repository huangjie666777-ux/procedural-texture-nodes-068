import { NODE_DEFS } from '../graph/nodes';

export const NODE_WIDTH = 190;
export const HEADER_HEIGHT = 34;
export const ROW_HEIGHT = 26;

export function nodeHeight(kind: keyof typeof NODE_DEFS): number {
  const def = NODE_DEFS[kind];
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  const hasParams = kind === 'number' || kind === 'rgb' || kind === 'scale2d' || kind === 'mix';
  return HEADER_HEIGHT + rows * ROW_HEIGHT + (hasParams ? 44 : 10);
}

export function portPosition(
  kind: keyof typeof NODE_DEFS,
  portId: string,
  side: 'in' | 'out',
  nodeX: number,
  nodeY: number,
): { x: number; y: number } {
  const def = NODE_DEFS[kind];
  const ports = side === 'in' ? def.inputs : def.outputs;
  const index = ports.findIndex((p) => p.id === portId);
  return {
    x: nodeX + (side === 'in' ? 0 : NODE_WIDTH),
    y: nodeY + HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2,
  };
}
