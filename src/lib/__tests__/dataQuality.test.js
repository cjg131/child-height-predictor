import { describe, it, expect } from 'vitest';
import {
  checkNewMeasurement, auditChild, auditFamily, maxPlausibleRateCmPerYear,
} from '../dataQuality.js';

const boy = { name: 'Sam', sex: 'male', birthDate: '2014-01-01' };
const h = (id, measurementDate, heightCm, extra = {}) => ({ id, measurementDate, heightCm, ...extra });

describe('checkNewMeasurement', () => {
  const existing = [h('a', '2025-01-01', 150), h('b', '2025-07-01', 154)];

  it('passes a normal reading with no warnings', () => {
    const w = checkNewMeasurement({
      child: boy, existing, measurementDate: '2026-01-01', heightCm: 157, today: '2026-01-02',
    });
    expect(w).toEqual([]);
  });

  it('blocks a date before birth', () => {
    const w = checkNewMeasurement({
      child: boy, existing, measurementDate: '2013-06-01', heightCm: 50, today: '2026-01-02',
    });
    expect(w).toHaveLength(1);
    expect(w[0].level).toBe('block');
  });

  it('warns when the child appears to shrink', () => {
    const w = checkNewMeasurement({
      child: boy, existing, measurementDate: '2026-01-01', heightCm: 150, today: '2026-01-02',
    });
    expect(w.some((x) => /shorter/.test(x.message))).toBe(true);
  });

  it('tolerates normal measuring error under 1 cm', () => {
    const w = checkNewMeasurement({
      child: boy, existing, measurementDate: '2026-01-01', heightCm: 153.3, today: '2026-01-02',
    });
    expect(w).toEqual([]);
  });

  it('warns on an implausible growth pace', () => {
    // 8 cm in 2 months = ~48 cm/yr
    const w = checkNewMeasurement({
      child: boy, existing, measurementDate: '2025-09-01', heightCm: 162, today: '2026-01-02',
    });
    expect(w.some((x) => /pace/.test(x.message))).toBe(true);
  });

  it('warns on a duplicate date and a future date', () => {
    const w = checkNewMeasurement({
      child: boy, existing, measurementDate: '2025-07-01', heightCm: 154, today: '2025-06-01',
    });
    expect(w.some((x) => /already a measurement/.test(x.message))).toBe(true);
    expect(w.some((x) => /future/.test(x.message))).toBe(true);
  });

  it('warns when a back-filled reading is taller than a later one', () => {
    const w = checkNewMeasurement({
      child: boy, existing, measurementDate: '2025-04-01', heightCm: 158, today: '2026-01-02',
    });
    expect(w.some((x) => /taller than the later/.test(x.message))).toBe(true);
  });

  it('warns on a reading far off the chart (feet vs inches mix-up)', () => {
    const w = checkNewMeasurement({
      child: boy, existing: [], measurementDate: '2025-01-01', heightCm: 60 * 2.54 * 1.6, today: '2026-01-02',
    });
    expect(w.some((x) => /far off the growth chart/.test(x.message))).toBe(true);
  });
});

describe('maxPlausibleRateCmPerYear', () => {
  it('allows fast infant growth and caps later growth', () => {
    expect(maxPlausibleRateCmPerYear(0.2)).toBe(65);
    expect(maxPlausibleRateCmPerYear(0.5)).toBe(40);
    expect(maxPlausibleRateCmPerYear(1.5)).toBe(20);
    expect(maxPlausibleRateCmPerYear(13)).toBe(15);
  });
});

describe('auditChild', () => {
  it('flags a flat stretch, a too-fast jump, and Tanner going backward', () => {
    const flags = auditChild(boy, [
      h('1', '2022-03-25', 127),
      h('2', '2022-07-15', 127),               // 112 days flat
      h('3', '2024-03-01', 135.89),
      h('4', '2024-04-07', 139.7),              // 3.81 cm in 37 days
      h('5', '2026-04-19', 158, { tannerStage: 3 }),
      h('6', '2026-07-30', 160, { tannerStage: 2 }),
    ]);
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('flat');
    expect(kinds).toContain('fast');
    expect(kinds).toContain('tanner-backward');
    expect(kinds).not.toContain('shrink');
  });

  it('judges a run of identical readings across the whole run', () => {
    const flags = auditChild(boy, [
      h('1', '2022-03-25', 127),
      h('2', '2022-06-08', 127),   // 75 days
      h('3', '2022-07-15', 127),   // +37 days, 112 total
      h('4', '2022-11-06', 130.81),
    ]);
    const flat = flags.filter((f) => f.kind === 'flat');
    expect(flat).toHaveLength(1);
    expect(flat[0].message).toContain('all 3');
  });

  it('does not flag a one-inch jump over five weeks in puberty (measuring noise)', () => {
    const flags = auditChild(boy, [h('1', '2026-01-09', 153.67), h('2', '2026-02-14', 156.21)]);
    expect(flags.filter((f) => f.kind === 'fast')).toHaveLength(0);
  });

  it('does not flag fast newborn growth', () => {
    const flags = auditChild({ ...boy, birthDate: '2016-06-07' },
      [h('1', '2016-06-07', 53.34), h('2', '2016-07-09', 58.42)]);
    expect(flags).toEqual([]);
  });

  it('does not flag a short flat gap or a plateau late in puberty', () => {
    const flags = auditChild(boy, [
      h('1', '2024-04-07', 139.7),
      h('2', '2024-06-20', 139.7),              // 74 days, under threshold
      h('3', '2030-01-01', 178),
      h('4', '2030-09-01', 178),                // age 16, plateau is normal
    ]);
    expect(flags.filter((f) => f.kind === 'flat')).toHaveLength(0);
  });

  it('flags shrinkage and duplicate dates', () => {
    const flags = auditChild(boy, [
      h('1', '2025-01-01', 150),
      h('2', '2025-01-01', 150.2),
      h('3', '2025-06-01', 147),
    ]);
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('duplicate-date');
    expect(kinds).toContain('shrink');
  });
});

describe('auditFamily', () => {
  const kids = [
    { name: 'A', fatherHeightCm: 167.64, motherHeightCm: 165.1, fatherMaturation: 'early' },
    { name: 'B', fatherHeightCm: 170.18, motherHeightCm: 165.1, fatherMaturation: 'average' },
    { name: 'C', fatherHeightCm: 170.18, motherHeightCm: 165.1 },
  ];

  it('flags parent fields that disagree across children', () => {
    const flags = auditFamily(kids, null);
    expect(flags.map((f) => f.field).sort()).toEqual(['fatherHeightCm', 'fatherMaturation']);
    const dad = flags.find((f) => f.field === 'fatherHeightCm');
    expect(dad.message).toContain(`5'6" on A`);
    expect(dad.message).toContain(`5'7" on B and C`);
  });

  it('stops flagging once the family record holds the value', () => {
    const flags = auditFamily(kids, { fatherHeightCm: 170.18, fatherMaturation: 'average' });
    expect(flags).toEqual([]);
  });
});
