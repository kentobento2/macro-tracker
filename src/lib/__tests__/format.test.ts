import { formatPortion, formatQuantity, formatWeight, formatWeightChange } from '../format';
import { parseWeightInput } from '../bodyweight';

describe('formatWeight', () => {
  it('shows one decimal in the user units', () => {
    expect(formatWeight(81.6, 'metric')).toBe('81.6 kg');
    expect(formatWeight(80, 'metric')).toBe('80.0 kg');
    expect(formatWeight(81.647, 'imperial')).toBe('180.0 lb');
  });
  it('round-trips typed pounds exactly', () => {
    for (const lb of ['180.4', '135.2', '201.9', '99.9']) {
      expect(formatWeight(parseWeightInput(lb, 'imperial')!, 'imperial')).toBe(`${lb} lb`);
    }
  });
});

describe('formatWeightChange', () => {
  it('signs changes with a true minus', () => {
    expect(formatWeightChange(-0.544, 'imperial')).toBe('−1.2 lb');
    expect(formatWeightChange(0.4, 'metric')).toBe('+0.4 kg');
    expect(formatWeightChange(0.01, 'metric')).toBe('±0.0 kg');
  });
});

describe('formatPortion / formatQuantity', () => {
  it('formats portions', () => {
    expect(formatQuantity(1.5)).toBe('1.5');
    expect(formatPortion({ quantity: 150, unit: 'g', serving: null, grams: 150 })).toBe('150 g');
    expect(formatPortion({ quantity: 2, unit: 'serving', serving: { label: '1 cup', grams: 150 }, grams: 300 })).toBe(
      '2 × 1 cup (300 g)'
    );
  });
});
