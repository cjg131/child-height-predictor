import { describe, it, expect } from 'vitest';
import {
  predictForChild, predictionHistory, projectionPath, growthRates, sortByDate,
} from '../predict.js';
import { cdcStatureZ } from '../../predictions/cdcPercentile.js';

const child = {
  sex: 'male', birthDate: '2014-02-27',
  motherHeightCm: 165.1, fatherHeightCm: 170.18, siblings: [],
};
const heights = [
  { id: 'c', measurementDate: '2024-02-27', heightCm: 140 },
  { id: 'a', measurementDate: '2016-02-27', heightCm: 87 },
  { id: 'b', measurementDate: '2020-02-27', heightCm: 116 },
  { id: 'd', measurementDate: '2025-02-27', heightCm: 146 },
];

describe('sortByDate', () => {
  it('sorts oldest first without mutating', () => {
    const copy = heights.slice();
    expect(sortByDate(heights).map((h) => h.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(heights).toEqual(copy);
  });
});

describe('predictForChild', () => {
  it('matches running the engine on the latest measurement regardless of input order', () => {
    const p1 = predictForChild(child, heights);
    const p2 = predictForChild(child, sortByDate(heights));
    expect(p1.consensus.predictedAdultHeightCm).toBeCloseTo(p2.consensus.predictedAdultHeightCm, 9);
  });
});

describe('predictionHistory', () => {
  it('produces one point per measurement from age 2 on, using only data known at the time', () => {
    const hist = predictionHistory(child, heights);
    expect(hist.map((p) => p.measurementDate)).toEqual(
      ['2016-02-27', '2020-02-27', '2024-02-27', '2025-02-27'],
    );
    const last = hist[hist.length - 1];
    const full = predictForChild(child, heights).consensus;
    expect(last.predictedCm).toBeCloseTo(full.predictedAdultHeightCm, 9);
    const early = predictForChild(child, sortByDate(heights).slice(0, 1)).consensus;
    expect(hist[0].predictedCm).toBeCloseTo(early.predictedAdultHeightCm, 9);
    for (const p of hist) {
      expect(p.lowCm).toBeLessThan(p.predictedCm);
      expect(p.highCm).toBeGreaterThan(p.predictedCm);
    }
  });

  it('skips measurements under age 2', () => {
    const hist = predictionHistory(child, [{ id: 'x', measurementDate: '2014-08-27', heightCm: 68 }]);
    expect(hist).toEqual([]);
  });
});

describe('projectionPath', () => {
  const latest = { measurementDate: '2025-02-27', heightCm: 146 };
  const consensus = { predictedAdultHeightCm: 175, rangeLowCm: 169, rangeHighCm: 181 };
  const path = projectionPath({ sex: 'male', birthDate: child.birthDate, latest, consensus });

  it('starts at the latest measurement', () => {
    expect(path[0].ageYears).toBeCloseTo(11, 2);
    expect(path[0].midCm).toBeCloseTo(146, 6);
    expect(path[0].lowCm).toBeCloseTo(146, 6);
    expect(path[0].highCm).toBeCloseTo(146, 6);
  });

  it('ends at the predicted adult height and range at age 20', () => {
    const end = path[path.length - 1];
    expect(end.ageYears).toBe(20);
    expect(end.midCm).toBeCloseTo(175, 6);
    expect(end.lowCm).toBeCloseTo(169, 6);
    expect(end.highCm).toBeCloseTo(181, 6);
  });

  it('never shrinks along the way and keeps low <= mid <= high', () => {
    for (let i = 1; i < path.length; i++) {
      expect(path[i].midCm).toBeGreaterThanOrEqual(path[i - 1].midCm - 1e-9);
      expect(path[i].lowCm).toBeLessThanOrEqual(path[i].midCm);
      expect(path[i].highCm).toBeGreaterThanOrEqual(path[i].midCm);
    }
  });

  it('moves linearly in z-space between start and end', () => {
    const mid = path[Math.floor(path.length / 2)];
    const startZ = cdcStatureZ({ sex: 'male', birthDate: child.birthDate, measurementDate: latest.measurementDate, heightCm: 146 }).z;
    const z = cdcStatureZ({
      sex: 'male', birthDate: child.birthDate,
      measurementDate: new Date(new Date(child.birthDate).getTime() + mid.ageYears * 365.25 * 86400000),
      heightCm: mid.midCm,
    }).z;
    const endZ = cdcStatureZ({ sex: 'male', birthDate: child.birthDate, measurementDate: '2034-02-27', heightCm: 175 }).z;
    const t = (mid.ageYears - path[0].ageYears) / (20 - path[0].ageYears);
    expect(z).toBeCloseTo(startZ + (endZ - startZ) * t, 2);
  });

  it('returns null without a usable measurement', () => {
    expect(projectionPath({ sex: 'male', birthDate: child.birthDate, latest: null, consensus })).toBeNull();
    expect(projectionPath({
      sex: 'male', birthDate: child.birthDate,
      latest: { measurementDate: '2015-02-27', heightCm: 76 }, consensus,
    })).toBeNull();
  });
});

describe('growthRates', () => {
  it('computes cm/year since the previous reading and skips gaps under 30 days', () => {
    const r = growthRates([
      { id: '1', measurementDate: '2024-01-01', heightCm: 140 },
      { id: '2', measurementDate: '2025-01-01', heightCm: 146 },
      { id: '3', measurementDate: '2025-01-15', heightCm: 146.2 },
    ]);
    expect(r['1']).toBeNull();
    expect(r['2']).toBeCloseTo(6 * 365.25 / 366, 6);
    expect(r['3']).toBeNull();
  });
});

describe('localDateIso', async () => {
  const { localDateIso } = await import('../units.js');
  it('uses local calendar fields, not UTC', () => {
    const d = new Date(2026, 10, 5, 23, 30); // 11:30pm local on Nov 5
    expect(localDateIso(d)).toBe('2026-11-05');
  });
});
