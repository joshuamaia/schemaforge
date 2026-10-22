import {
  DEFAULT_PANEL_SIZES,
  MIN_PANEL_SIZE,
  isValidPanelSizes,
  resizePanels,
} from './panel-sizes';

describe('panel sizes', () => {
  it('moves only the boundary between adjacent panels', () => {
    expect(resizePanels([30, 30, 40], 0, 5)).toEqual([35, 25, 40]);
    expect(resizePanels([30, 30, 40], 1, -5)).toEqual([30, 25, 45]);
  });

  it('respects the minimum panel size', () => {
    expect(resizePanels([30, 30, 40], 0, 50)).toEqual([60 - MIN_PANEL_SIZE, MIN_PANEL_SIZE, 40]);
    expect(resizePanels([30, 30, 40], 0, -50)).toEqual([MIN_PANEL_SIZE, 60 - MIN_PANEL_SIZE, 40]);
  });

  it('validates persisted sizes', () => {
    expect(isValidPanelSizes(DEFAULT_PANEL_SIZES)).toBe(true);
    expect(isValidPanelSizes([10, 10, 80])).toBe(false);
    expect(isValidPanelSizes('x')).toBe(false);
  });
});
