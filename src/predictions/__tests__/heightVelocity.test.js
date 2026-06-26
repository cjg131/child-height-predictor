import { describe, it, expect } from 'vitest';
import { heightVelocity } from '../heightVelocity.js';

describe('heightVelocity', () => {
  it('returns insufficient with only one measurement', () => {
    const r = heightVelocity({
      sex: 'male',
      birthDate: '2014-02-27',
      heights: [{ measurementDate: '2026-01-01', heightCm: 150 }],
    });
    expect(r.state).toBe('insufficient');
  });

  it('computes velocity between two points spaced a year apart', () => {
    const r = heightVelocity({
      sex: 'male',
      birthDate: '2014-02-27',
      heights: [
        { measurementDate: '2025-01-01', heightCm: 145 },
        { measurementDate: '2026-01-01', heightCm: 151 },
      ],
    });
    expect(r.velocities.length).toBe(1);
    expect(r.velocities[0].cmPerYear).toBeCloseTo(6, 1);
  });

  it('detects post-PHV when growth has slowed after a peak', () => {
    // Boy with a 9cm/yr peak around age 13.5 then slowing to 2cm/yr
    const r = heightVelocity({
      sex: 'male',
      birthDate: '2010-01-01',
      heights: [
        { measurementDate: '2022-01-01', heightCm: 142 }, // age 12
        { measurementDate: '2023-01-01', heightCm: 148 }, // +6
        { measurementDate: '2024-01-01', heightCm: 157.5 }, // +9.5 (PHV)
        { measurementDate: '2025-01-01', heightCm: 163.5 }, // +6
        { measurementDate: '2026-01-01', heightCm: 165.5 }, // +2 (post-PHV)
      ],
    });
    expect(r.peak).not.toBeNull();
    expect(r.peak.cmPerYear).toBeGreaterThan(7);
    expect(r.state).toBe('post-phv');
    expect(r.monthsSincePhv).toBeGreaterThan(0);
  });

  it('flags pre-PHV for a 10-year-old still growing at 5 cm/yr', () => {
    const r = heightVelocity({
      sex: 'male',
      birthDate: '2016-01-01',
      heights: [
        { measurementDate: '2025-01-01', heightCm: 135 },
        { measurementDate: '2026-01-01', heightCm: 140 },
      ],
    });
    expect(r.state).toBe('pre-phv');
  });

  it('skips intervals shorter than 90 days', () => {
    const r = heightVelocity({
      sex: 'male',
      birthDate: '2014-02-27',
      heights: [
        { measurementDate: '2026-01-01', heightCm: 150 },
        { measurementDate: '2026-02-01', heightCm: 151 },
      ],
    });
    expect(r.state).toBe('insufficient');
  });
});
