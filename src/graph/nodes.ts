import type { NodeDef, NodeKind, PortType } from './types';

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
  number: {
    kind: 'number',
    title: '数值',
    inputs: [],
    outputs: [{ id: 'out', name: 'out', type: 'float' }],
    data: { value: 0.5 },
  },
  color: {
    kind: 'color',
    title: 'RGB 颜色',
    inputs: [],
    outputs: [{ id: 'rgb', name: 'rgb', type: 'vec3' }],
    data: { r: 0.2, g: 0.5, b: 0.9 },
  },
  uv: {
    kind: 'uv',
    title: 'UV',
    inputs: [],
    outputs: [{ id: 'uv', name: 'uv', type: 'vec2' }],
    data: {},
  },
  scale2d: {
    kind: 'scale2d',
    title: '二维缩放',
    inputs: [
      { id: 'in', name: 'in', type: 'vec2', defaultLiteral: 'vUv', defaultLabel: 'UV' },
      { id: 's', name: 'scale', type: 'vec2', defaultLiteral: 'vec2(1.0, 1.0)', defaultLabel: '(1, 1)' },
    ],
    outputs: [{ id: 'out', name: 'out', type: 'vec2' }],
    data: { sx: 4, sy: 4 },
  },
  checker: {
    kind: 'checker',
    title: '棋盘格',
    inputs: [
      { id: 'uv', name: 'uv', type: 'vec2', defaultLiteral: 'vUv', defaultLabel: 'UV' },
      { id: 'scale', name: 'scale', type: 'vec2', defaultLiteral: 'vec2(4.0, 4.0)', defaultLabel: '(4, 4)' },
    ],
    outputs: [{ id: 'out', name: 'out', type: 'float' }],
    data: { sx: 8, sy: 8 },
  },
  add: {
    kind: 'add',
    title: '加法',
    inputs: [
      { id: 'a', name: 'a', type: 'any', defaultLiteral: '0.0', defaultLabel: '0' },
      { id: 'b', name: 'b', type: 'any', defaultLiteral: '0.0', defaultLabel: '0' },
    ],
    outputs: [{ id: 'out', name: 'out', type: 'float' }],
    data: {},
  },
  mul: {
    kind: 'mul',
    title: '乘法',
    inputs: [
      { id: 'a', name: 'a', type: 'any', defaultLiteral: '1.0', defaultLabel: '1' },
      { id: 'b', name: 'b', type: 'any', defaultLiteral: '1.0', defaultLabel: '1' },
    ],
    outputs: [{ id: 'out', name: 'out', type: 'float' }],
    data: {},
  },
  mix: {
    kind: 'mix',
    title: '混合',
    inputs: [
      { id: 'a', name: 'a', type: 'any', defaultLiteral: '0.0', defaultLabel: '0（广播）' },
      { id: 'b', name: 'b', type: 'any', defaultLiteral: '1.0', defaultLabel: '1（广播）' },
      { id: 't', name: 'factor', type: 'float', defaultLiteral: '0.5', defaultLabel: '0.5' },
    ],
    outputs: [{ id: 'out', name: 'out', type: 'float' }],
    data: {},
  },
  output: {
    kind: 'output',
    title: '颜色输出',
    inputs: [
      { id: 'color', name: 'color', type: 'any', defaultLiteral: 'vec3(0.5)', defaultLabel: '灰色 0.5' },
    ],
    outputs: [],
    data: {},
  },
};

export function nodeDef(kind: NodeKind): NodeDef {
  return NODE_DEFS[kind];
}

export const TYPE_COLORS: Record<PortType, string> = {
  float: '#7dd3fc',
  vec2: '#fcd34d',
  vec3: '#f9a8d4',
};

export const TYPE_LABELS: Record<PortType, string> = {
  float: 'float',
  vec2: 'vec2',
  vec3: 'vec3',
};
