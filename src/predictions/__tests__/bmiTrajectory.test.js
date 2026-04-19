import { describe, it, expect } from 'vitest';
import { bmiTrajectory } from '../bmiTrajectory.js';

function daysBefore(ref, days) {
  const d = new Date(ref);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

describe('bmiTrajectory', () => {
  it('returns insufficient when no measurements', () => {
    const r = bmiTrajectory({ birthDate: '2020-01-01', heights: [] });
    expect(r.state).toBe('insufficient');
    expect(r.series).toEqual([]);
  });

  it('returns insufficient with fewer than 3 paired measurements', () => {
    const r = bmiTrajectory({
      birthDate: '2020-01-01',
      heights: [
        { measurementDate: '2023-01-01', heightCm: 95, weightKg: 14 },
        { measurementDate: '2024-01-01', heightCm: 103, weightKg: 16 },
      ],
    });
    expect(r.state).toBe('insufficient');
    expect(r.series).toHaveLength(2);
    expect(r.currentBmi).toBeCloseTo(16 / 1.03 / 1.03, 2);
  });

  it('detects classic adiposity rebound in the normal window', () => {
    // Simulate a child whose BMI dips around age 5.5, then climbs.
    const birthDate = '2015-06-01';
    const heights = [
      { measurementDate: '2018-06-01', heightCm: 95, weightKg: 14.3 }, // age 3, bmi ~15.8
      { measurementDate: '2019-06-01', heightCm: 104, weightKg: 16.2 }, // age 4, bmi ~15.0
      { measurementDate: '2020-06-01', heightCm: 110, weightKg: 17.5 }, // age 5, bmi ~14.5
      { measurementDate: '2021-06-01', heightCm: 117, weightKg: 20.0 }, // age 6, bmi ~14.6
      { measurementDate: '2022-06-01', heightCm: 123, weightKg: 23.5 }, // age 7, bmi ~15.5
      { measurementDate: '2023-06-01', heightCm: 129, weightKg: 27.0 }, // age 8, bmi ~16.2
    ];
    const r = bmiTrajectory({ birthDate, heights });
    expect(r.state).toBe('rebound-detected');
    expect(r.rebound).not.toBeNull();
    expect(r.rebound.ageYears).toBeGreaterThanOrEqual(4.5);
    expect(r.rebound.ageYears).toBeLessThanOrEqual(7.0);
    expect(['early', 'normal']).toContain(r.rebound.timing);
    expect(r.currentBmi).toBeGreaterThan(15.5);
  });

  it('detects early rebound before age 5', () => {
    const birthDate = '2017-01-01';
    const heights = [
      { measurementDate: '2019-01-01', heightCm: 85, weightKg: 12.5 },  // age 2
      { measurementDate: '2020-01-01', heightCm: 92, weightKg: 13.4 },  // age 3
      { measurementDate: '2021-01-01', heightCm: 100, weightKg: 14.8 }, // age 4 - nadir
      { measurementDate: '2022-01-01', heightCm: 107, weightKg: 17.8 }, // age 5 - climbing
      { measurementDate: '2023-01-01', heightCm: 113, weightKg: 21.2 }, // age 6
      { measurementDate: '2024-01-01', heightCm: 119, weightKg: 25.0 }, // age 7
    ];
    const r = bmiTrajectory({ birthDate, heights });
    expect(r.state).toBe('rebound-detected');
    expect(r.rebound.timing).toBe('early');
    expect(r.rebound.ageYears).toBeLessThan(5);
  });

  it('reports pre-rebound if BMI still declining with no confirmed turnaround', () => {
    const birthDate = '2020-01-01';
    const heights = [
      { measurementDate: '2023-01-01', heightCm: 95, weightKg: 15.0 },  // bmi 16.6
      { measurementDate: '2024-01-01', heightCm: 103, weightKg: 16.3 }, // bmi 15.4
      { measurementDate: '2025-01-01', heightCm: 110, weightKg: 17.5 }, // bmi 14.5
    ];
    const r = bmiTrajectory({ birthDate, heights });
    expect(r.state).toBe('pre-rebound');
    expect(r.rebound).toBeNull();
  });

  it('computes reasonable BMI trend per year', () => {
    const birthDate = '2017-01-01';
    const heights = [
      { measurementDate: '2022-01-01', heightCm: 110, weightKg: 17.5 },
      { measurementDate: '2023-01-01', heightCm: 117, weightKg: 20.0 },
      { measurementDate: '2024-01-01', heightCm: 123, weightKg: 23.5 },
      { measurementDate: '2025-01-01', heightCm: 129, weightKg: 27.0 },
    ];
    const r = bmiTrajectory({ birthDate, heights });
    expect(r.bmiTrendPerYear).not.toBeNull();
    expect(r.bmiTrendPerYear).toBeGreaterThan(0);
    expect(r.bmiTrendPerYear).toBeLessThan(2);
  });
});
