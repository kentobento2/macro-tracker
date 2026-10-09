import {
  cmToFeetInches,
  feetInchesToCm,
  GRAMS_PER_OUNCE,
  gramsToQuantity,
  kgToPounds,
  portionToGrams,
  poundsToKg,
} from '../units';

describe('portionToGrams', () => {
  it('passes grams through', () => {
    expect(portionToGrams(150, 'g')).toBe(150);
  });
  it('converts ounces', () => {
    expect(portionToGrams(4, 'oz')).toBeCloseTo(113.398);
    expect(portionToGrams(1, 'oz')).toBe(GRAMS_PER_OUNCE);
  });
  it('multiplies servings by serving weight', () => {
    expect(portionToGrams(1.5, 'serving', { label: '1 cup', grams: 150 })).toBe(225);
  });
  it('requires a serving for unit "serving"', () => {
    expect(() => portionToGrams(1, 'serving')).toThrow();
    expect(() => portionToGrams(1, 'serving', { label: 'bad', grams: 0 })).toThrow();
  });
  it('rejects negative quantities', () => {
    expect(() => portionToGrams(-1, 'g')).toThrow(RangeError);
  });
});

describe('body unit conversions', () => {
  it('round-trips pounds and kg', () => {
    expect(poundsToKg(1)).toBe(0.45359237);
    expect(kgToPounds(poundsToKg(180))).toBeCloseTo(180);
  });
  it('converts feet/inches to cm and back', () => {
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8);
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 });
  });
  it('never returns 12 inches', () => {
    expect(cmToFeetInches(182.6)).toEqual({ feet: 6, inches: 0 });
  });
});

describe('gramsToQuantity', () => {
  it('inverts portionToGrams', () => {
    const cup = { label: '1 cup', grams: 150 };
    expect(gramsToQuantity(225, 'serving', cup)).toBe(1.5);
    expect(gramsToQuantity(GRAMS_PER_OUNCE * 3, 'oz')).toBeCloseTo(3);
    expect(gramsToQuantity(80, 'g')).toBe(80);
  });
});
