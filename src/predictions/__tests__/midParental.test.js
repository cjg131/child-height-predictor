import { describe, it, expect } from 'vitest';
import { midParentalHeight, midParentalHeightImperial } from '../midParental.js';
import { inToCm } from '../../lib/units.js';

describe('midParentalHeight', () => {
  it('returns null when a parent height is missing', () => {
    expect(midParentalHeight({ sex: 'male', motherHeightCm: 165, fatherHeightCm: null })).toBeNull();
    expect(midParentalHeight({ sex: 'female', motherHeightCm: null, fatherHeightCm: 180 })).toBeNull();
  });

  it('adds 6.5cm for boys (Tanner)', () => {
    // mother 5'4" (162.56), father 6'0" (182.88), mid = 172.72, boy target = 179.22
    const r = midParentalHeight({
      sex: 'male',
      motherHeightCm: inToCm(64),
      fatherHeightCm: inToCm(72),
    });
    expect(r.targetCm).toBeCloseTo(172.72 + 6.5, 2);
    expect(r.rangeLowCm).toBeCloseTo(r.targetCm - 10, 6);
    expect(r.rangeHighCm).toBeCloseTo(r.targetCm + 10, 6);
    expect(r.sdCm).toBe(5);
  });

  it('subtracts 6.5cm for girls (Tanner)', () => {
    // mother 5'6" (167.64), father 5'11" (180.34), mid = 173.99, girl target = 167.49
    const r = midParentalHeight({
      sex: 'female',
      motherHeightCm: inToCm(66),
      fatherHeightCm: inToCm(71),
    });
    const expected = (inToCm(66) + inToCm(71)) / 2 - 6.5;
    expect(r.targetCm).toBeCloseTo(expected, 6);
  });

  it('imperial helper round-trips correctly', () => {
    const r = midParentalHeightImperial({
      sex: 'male',
      motherHeightIn: 64,
      fatherHeightIn: 72,
    });
    // Point estimate in inches should be 68 + 2.5 = 70.5
    expect(r.targetIn).toBeCloseTo(70.5, 2);
  });

  it('throws on invalid sex', () => {
    expect(() => midParentalHeight({
      sex: 'other', motherHeightCm: 165, fatherHeightCm: 180,
    })).toThrow();
  });
});
