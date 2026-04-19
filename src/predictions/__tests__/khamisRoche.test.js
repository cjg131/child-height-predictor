import { describe, it, expect } from 'vitest';
import { khamisRoche } from '../khamisRoche.js';
import { inToCm, lbToKg, cmToIn } from '../../lib/units.js';

describe('khamisRoche', () => {
  it('returns null when any input is missing', () => {
    const base = {
      sex: 'male',
      birthDate: '2014-02-27',
      measurementDate: '2026-04-19',
      currentHeightCm: 150,
      currentWeightKg: 45,
      motherHeightCm: 165,
      fatherHeightCm: 180,
    };
    expect(khamisRoche({ ...base, motherHeightCm: null })).toBeNull();
    expect(khamisRoche({ ...base, fatherHeightCm: null })).toBeNull();
    expect(khamisRoche({ ...base, currentHeightCm: null })).toBeNull();
    expect(khamisRoche({ ...base, currentWeightKg: null })).toBeNull();
  });

  it('produces a reasonable estimate for a 12-year-old boy at the 50th percentile', () => {
    // 12yo boy, 59 inches (~150cm, ~50th percentile), 90 lb, mom 5'5", dad 6'0".
    // Expected: roughly 5'9"-5'11" adult height.
    const res = khamisRoche({
      sex: 'male',
      birthDate: '2014-02-27',
      measurementDate: '2026-04-19',
      currentHeightCm: inToCm(59),
      currentWeightKg: lbToKg(90),
      motherHeightCm: inToCm(65),
      fatherHeightCm: inToCm(72),
    });
    expect(res).not.toBeNull();
    expect(res.inAgeRange).toBe(true);
    const inches = cmToIn(res.predictedAdultHeightCm);
    expect(inches).toBeGreaterThan(68);
    expect(inches).toBeLessThan(73);
    expect(res.sdCm).toBeCloseTo(5.6 / 1.645, 4);
    expect(res.rangeLowCm).toBeLessThan(res.predictedAdultHeightCm);
    expect(res.rangeHighCm).toBeGreaterThan(res.predictedAdultHeightCm);
  });

  it('flags out-of-range ages but still returns a value', () => {
    const res = khamisRoche({
      sex: 'male',
      birthDate: '2024-01-01',
      measurementDate: '2026-04-19',  // ~2.3 yrs old, below min
      currentHeightCm: 88,
      currentWeightKg: 12,
      motherHeightCm: 165,
      fatherHeightCm: 180,
    });
    expect(res.inAgeRange).toBe(false);
    expect(res.outOfRangeReason).toMatch(/below/);
    expect(res.predictedAdultHeightCm).toBeGreaterThan(120);
  });

  it('taller parents yield a taller prediction, holding the child fixed', () => {
    const base = {
      sex: 'female',
      birthDate: '2016-04-19',
      measurementDate: '2026-04-19',
      currentHeightCm: 140,
      currentWeightKg: 35,
    };
    const a = khamisRoche({ ...base, motherHeightCm: 160, fatherHeightCm: 175 });
    const b = khamisRoche({ ...base, motherHeightCm: 170, fatherHeightCm: 188 });
    expect(b.predictedAdultHeightCm).toBeGreaterThan(a.predictedAdultHeightCm);
  });

  it('trajectory weight shifts toward child as age increases', () => {
    // At 5 years, more weight on mid-parental. At 16, more on trajectory.
    const base = {
      sex: 'male',
      currentHeightCm: 110,
      currentWeightKg: 20,
      motherHeightCm: 165,
      fatherHeightCm: 180,
    };
    const young = khamisRoche({
      ...base,
      birthDate: '2021-04-19',
      measurementDate: '2026-04-19',     // age 5
    });
    const old = khamisRoche({
      ...base,
      currentHeightCm: 170,
      currentWeightKg: 60,
      birthDate: '2010-04-19',
      measurementDate: '2026-04-19',     // age 16
    });
    expect(young.components.trajectoryWeight).toBeLessThan(old.components.trajectoryWeight);
  });

  it('heavier-than-median child gets a small positive height nudge', () => {
    const base = {
      sex: 'male',
      birthDate: '2014-02-27',
      measurementDate: '2026-04-19',
      currentHeightCm: 150,
      motherHeightCm: 165,
      fatherHeightCm: 180,
    };
    const heavy = khamisRoche({ ...base, currentWeightKg: 60 });
    const light = khamisRoche({ ...base, currentWeightKg: 30 });
    expect(heavy.components.weightAdjustmentCm)
      .toBeGreaterThan(light.components.weightAdjustmentCm);
  });
});
