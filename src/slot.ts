import { SYMBOLS, type SymbolId } from './data';

/** Cell indices (row * 3 + col) for every line that can pay out. */
export const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export interface LineMatch {
  cells: number[];
  symbol: SymbolId;
}

export function rollSymbol(weights: Record<SymbolId, number>, rng: () => number = Math.random): SymbolId {
  const total = SYMBOLS.reduce((sum, s) => sum + weights[s], 0);
  let r = rng() * total;
  for (const s of SYMBOLS) {
    r -= weights[s];
    if (r < 0) return s;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

export function rollGrid(weights: Record<SymbolId, number>, rng: () => number = Math.random): SymbolId[] {
  return Array.from({ length: 9 }, () => rollSymbol(weights, rng));
}

/** A line matches when all three symbols are equal, with wild (Core) symbols counting as anything. */
export function findLines(grid: SymbolId[]): LineMatch[] {
  const matches: LineMatch[] = [];
  for (const cells of LINES) {
    const kinds = new Set(cells.map((i) => grid[i]).filter((s) => s !== 'wild'));
    if (kinds.size === 0) matches.push({ cells, symbol: 'wild' });
    else if (kinds.size === 1) matches.push({ cells, symbol: [...kinds][0] });
  }
  return matches;
}

/** Estimated chance that a spin produces at least one winning line. */
export function winChance(weights: Record<SymbolId, number>, samples = 4000): number {
  let wins = 0;
  for (let k = 0; k < samples; k++) if (findLines(rollGrid(weights)).length) wins++;
  return wins / samples;
}
