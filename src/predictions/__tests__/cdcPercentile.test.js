import { describe, it, expect } from 'vitest';
import {
  zFromLMS,
  valueFromLMS,
  normalCdf,
  zToPercentile,
  cdcStatureZ,
  cdcPercentileProjection,
  cdcPercentileCurves,
} from '../cdcPercentile.js';
import { CDC_STATURE_LMS } from '../../growth-data/cdc-stature-lms.js';

describe('LMS math', () => {
  it('z of median is zero', () => {
    // At any LMS, passing X = M should yield z = 0.
    expect(zFromLMS(50, 1, 50, 0.05)).toBeCloseTo(0, 10);
    expect(zFromLMS(100, -0.5, 100, 0.08)).toBeCloseTo(0, 10);
  });

  it('valueFromLMS is the inverse of zFromLMS', () => {
    const cases = [
      { X: 140, L: -1.5, M: 138, S: 0.045 },
      { X: 160, L: 0.2, M: 155, S: 0.038 },
      { X: 172, L: 0, M: 170, S: 0.05 },   // L == 0 branch
    ];
    for (const { X, L, M, S } of cases) {
      const z = zFromLMS(X, L, M, S);
      const back = valueFromLMS(z, L, M, S);
      expect(back).toBeCloseTo(X, 6);
    }
  });

  it('normal CDF hits known landmarks', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
    expect(zToPercentile(0)).toBeCloseTo(50, 6);
    expect(zToPercentile(1.2816)).toBeCloseTo(90, 2);
  });
});

describe('cdcStatureZ', () => {
  it('a 5th-percentile boy stature returns z close to -1.645', () => {
    // Find the boys row at exactly 12 years (144 months) and pick a value
    // corresponding to z = -1.645, then hand it back to the function.
    const row = CDC_STATURE_LMS.boys.find((r) => r.ageMonths === 144.5);
    const z = -1.645;
    const X = valueFromLMS(z, row.L, row.M, row.S);

    const birthDate = '2014-04-19';
    const measurementDate = new Date('2014-04-19');
    // 12 years after birth = 2026-04-19. We want ageMonths ~ 144.5.
    measurementDate.setUTCFullYear(2026);
    measurementDate.setUTCDate(measurementDate.getUTCDate() + 15);  // roughly half a month past birthday

    const res = cdcStatureZ({
      sex: 'male',
      birthDate,
      measurementDate: measurementDate.toISOString().slice(0, 10),
      heightCm: X,
    });
    // Since our measurement date is close to 12yrs but interpolated, allow
    // generous tolerance.
    expect(res.z).toBeCloseTo(-1.645, 0);
    expect(res.percentile).toBeGreaterThan(3);
    expect(res.percentile).toBeLessThan(10);
  });

  it('a 50th-percentile boy at age 10 has z ~ 0', () => {
    const row = CDC_STATURE_LMS.boys.find((r) => r.ageMonths === 120.5);
    const X = row.M;  // median
    const res = cdcStatureZ({
      sex: 'male',
      birthDate: '2016-04-19',
      measurementDate: '2026-04-19',  // ~10 years old
      heightCm: X,
    });
    expect(Math.abs(res.z)).toBeLessThan(0.1);
    expect(res.percentile).toBeCloseTo(50, 0);
  });
});

describe('cdcPercentileProjection', () => {
  it('a 50th-percentile boy projects to around 176.8 cm adult (CDC male median at 20)', () => {
    const row = CDC_STATURE_LMS.boys.find((r) => r.ageMonths === 120.5);
    const X = row.M;
    const res = cdcPercentileProjection({
      sex: 'male',
      birthDate: '2016-04-19',
      measurementDate: '2026-04-19',
      heightCm: X,
    });
    // 50th percentile at age 20 for boys in the CDC reference is around 176.8 cm.
    expect(res.predictedAdultHeightCm).toBeGreaterThan(174);
    expect(res.predictedAdultHeightCm).toBeLessThan(179);
    expect(res.currentPercentile).toBeCloseTo(50, 0);
  });

  it('a 90th-percentile girl projects taller than the median', () => {
    const row = CDC_STATURE_LMS.girls.find((r) => r.ageMonths === 144.5);
    const z = 1.2816;
    const X = valueFromLMS(z, row.L, row.M, row.S);
    const res = cdcPercentileProjection({
      sex: 'female',
      birthDate: '2014-04-19',
      measurementDate: '2026-04-19',  // ~12 yrs
      heightCm: X,
    });
    // Girls median at 20 is ~163 cm, so a 90th percentile girl should end
    // around 170-172 cm.
    expect(res.predictedAdultHeightCm).toBeGreaterThan(167);
    expect(res.predictedAdultHeightCm).toBeLessThan(175);
  });
});

describe('cdcPercentileCurves', () => {
  it('returns monotonically ordered percentiles at each age', () => {
    const curves = cdcPercentileCurves('male');
    for (const row of curves) {
      expect(row.p3).toBeLessThan(row.p10);
      expect(row.p10).toBeLessThan(row.p25);
      expect(row.p25).toBeLessThan(row.p50);
      expect(row.p50).toBeLessThan(row.p75);
      expect(row.p75).toBeLessThan(row.p90);
      expect(row.p90).toBeLessThan(row.p97);
    }
  });

  it('produces reasonable output for girls too', () => {
    const curves = cdcPercentileCurves('female', { startMonths: 24, endMonths: 240, stepMonths: 12 });
    expect(curves[0].p50).toBeGreaterThan(80);   // ~85 cm at age 2
    expect(curves[0].p50).toBeLessThan(90);
    expect(curves[curves.length - 1].p50).toBeGreaterThan(160);  // ~163 at 20
    expect(curves[curves.length - 1].p50).toBeLessThan(166);
  });
});
