import type { NodeKind, PortDef, PortType } from './types';

export interface NodeDef {
  kind: NodeKind;
  label: string;
  inputs: PortDef[];
  outputs: PortDef[];
  defaultParams: Record<string, number | { r: number; g: number; b: number } | { x: number; y: number }>;
}

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
  number: {
    kind: 'number',
    label: '数值 Number',
    inputs: [],
    outputs: [{ id: 'out', label: 'value', type: 'float' }],
    defaultParams: { value: 0.5 },
  },
  rgb: {
    kind: 'rgb',
    label: 'RGB 颜色',
    inputs: [],
    outputs: [{ id: 'out', label: 'color', type: 'vec3' }],
    defaultParams: { color: { r: 0.8, g: 0.2, b: 0.4 } },
  },
  uv: {
    kind: 'uv',
    label: 'UV',
    inputs: [],
    outputs: [{ id: 'out', label: 'uv', type: 'vec2' }],
    defaultParams: {},
  },
  scale2d: {
    kind: 'scale2d',
    label: '二维缩放 Scale2D',
    inputs: [
      { id: 'uv', label: 'uv', type: 'vec2', defaultText: '(u, v)' },
      { id: 'scale', label: 'scale', type: 'vec2', defaultText: '(1, 1)' },
    ],
    outputs: [{ id: 'out', label: 'result', type: 'vec2' }],
    defaultParams: { scale: { x: 4, y: 4 } },
  },
  checker: {
    kind: 'checker',
    label: '棋盘格 Checker',
    inputs: [{ id: 'uv', label: 'uv', type: 'vec2', defaultText: '(u, v)' }],
    outputs: [{ id: 'out', label: 'mask', type: 'float' }],
    defaultParams: {},
  },
  add: {
    kind: 'add',
    label: '加法 Add',
    inputs: [
      { id: 'a', label: 'a', type: 'float', defaultText: '0' },
      { id: 'b', label: 'b', type: 'float', defaultText: '0' },
    ],
    outputs: [{ id: 'out', label: 'sum', type: 'float' }],
    defaultParams: {},
  },
  multiply: {
    kind: 'multiply',
    label: '乘法 Multiply',
    inputs: [
      { id: 'a', label: 'a', type: 'float', defaultText: '1' },
      { id: 'b', label: 'b', type: 'float', defaultText: '1' },
    ],
    outputs: [{ id: 'out', label: 'product', type: 'float' }],
    defaultParams: {},
  },
  mix: {
    kind: 'mix',
    label: '混合 Mix',
    inputs: [
      { id: 'a', label: 'a', type: 'float', defaultText: '0 / (0,0,0)' },
      { id: 'b', label: 'b', type: 'float', defaultText: '0 / (0,0,0)' },
      { id: 't', label: 'weight', type: 'float', defaultText: '0.5' },
    ],
    outputs: [{ id: 'out', label: 'result', type: 'float' }],
    defaultParams: { t: 0.5 },
  },
  output: {
    kind: 'output',
    label: '颜色输出 Output',
    inputs: [{ id: 'color', label: 'color', type: 'vec3', defaultText: '0.5 灰' }],
    outputs: [],
    defaultParams: {},
  },
};

export const KIND_ORDER: NodeKind[] = [
  'number',
  'rgb',
  'uv',
  'scale2d',
  'checker',
  'add',
  'multiply',
  'mix',
  'output',
];

export function outputType(kind: NodeKind, inputTypes: (PortType | null)[]): PortType | null {
  const [a, b] = inputTypes;
  switch (kind) {
    case 'number':
      return 'float';
    case 'rgb':
      return 'vec3';
    case 'uv':
      return 'vec2';
    case 'scale2d':
      return 'vec2';
    case 'checker':
      return 'float';
    case 'add':
    case 'multiply': {
      if (!a && !b) return 'float';
      if (!a) return b;
      if (!b) return a;
      if (a === 'vec2' || b === 'vec2') return a === 'vec3' || b === 'vec3' ? null : 'vec2';
      if (a === 'vec3' || b === 'vec3') return 'vec3';
      return 'float';
    }
    case 'mix': {
      if (!a && !b) return 'float';
      if (!a || !b) return a ?? b;
      return a === b ? a : null;
    }
    case 'output':
      return null;
  }
}
