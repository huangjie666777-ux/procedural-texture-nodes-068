export type PortType = 'float' | 'vec2' | 'vec3';

/** 'any' means the concrete type is inferred from connections (float by default). */
export type PortDeclType = PortType | 'any';

export type NodeKind =
  | 'number'
  | 'color'
  | 'uv'
  | 'scale2d'
  | 'checker'
  | 'add'
  | 'mul'
  | 'mix'
  | 'output';

export interface InputPortDef {
  id: string;
  name: string;
  type: PortDeclType;
  /** GLSL literal used when the input is not connected. */
  defaultLiteral: string;
  /** Human readable default shown in the UI. */
  defaultLabel: string;
}

export interface OutputPortDef {
  id: string;
  name: string;
  type: PortType;
}

export interface NodeDef {
  kind: NodeKind;
  title: string;
  inputs: InputPortDef[];
  outputs: OutputPortDef[];
  data: Record<string, number>;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  data: Record<string, number>;
}

export interface Edge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: Edge[];
  nextId: number;
}

export interface PortRef {
  node: string;
  port: string;
}

export interface GraphError {
  nodeId: string;
  portId?: string;
  message: string;
}
