export const NODE_WIDTH = 184;
export const HEADER_H = 36;
export const PORT_ROW_H = 28;
export const DOT_R = 6;
export const DOT_HIT = 14;

export function inputPortY(index: number): number {
  return HEADER_H + index * PORT_ROW_H + PORT_ROW_H / 2;
}

export function outputPortY(index: number): number {
  return HEADER_H + index * PORT_ROW_H + PORT_ROW_H / 2;
}
