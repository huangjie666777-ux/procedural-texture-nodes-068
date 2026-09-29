export type PortType = 'float' | 'vec2' | 'vec3';

export type NodeKind =
  | 'number'
  | 'rgb'
  | 'uv'
  | 'scale2d'
  | 'checker'
  | 'add'
  | 'multiply'
  | 'mix'
  | 'output';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type NodeParam = number | RGB | { x: number; y: number };

export interface GNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  params: Record<string, NodeParam>;
}

export interface Edge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface Graph {
  nodes: GNode[];
  edges: Edge[];
}

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  defaultText?: string;
}
