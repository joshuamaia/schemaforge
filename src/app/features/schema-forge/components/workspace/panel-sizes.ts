export type PanelSizes = readonly [number, number, number];

export const DEFAULT_PANEL_SIZES: PanelSizes = [32, 30, 38];
export const MIN_PANEL_SIZE = 18;

/**
 * Moves the boundary after panel `index` by `delta` percent, keeping every panel above the
 * minimum size. Only the two panels adjacent to the boundary change.
 */
export function resizePanels(sizes: PanelSizes, index: 0 | 1, delta: number): PanelSizes {
  const next = [...sizes] as [number, number, number];
  const left = next[index];
  const right = next[index + 1];
  const clamped = Math.max(MIN_PANEL_SIZE - left, Math.min(right - MIN_PANEL_SIZE, delta));
  next[index] = left + clamped;
  next[index + 1] = right - clamped;
  return next;
}

export function isValidPanelSizes(value: unknown): value is PanelSizes {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((size) => typeof size === 'number' && size >= MIN_PANEL_SIZE) &&
    Math.abs(value.reduce((sum: number, size: number) => sum + size, 0) - 100) < 0.5
  );
}
