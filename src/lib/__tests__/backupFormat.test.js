import { describe, it, expect } from 'vitest';
import {
  buildBackup, toCsv, planRestore, docFields, toPlain, backupStats,
} from '../backupFormat.js';

const ts = (iso) => ({ toDate: () => new Date(iso) });

const children = [
  {
    id: 'k1', name: 'Sam', birthDate: '2014-01-01', sex: 'male', createdAt: ts('2026-04-19T16:00:00Z'),
    heights: [
      { id: 'h2', measurementDate: '2025-01-01', heightCm: 150, weightKg: 40, note: 'after "camp", tall' },
      { id: 'h1', measurementDate: '2024-01-01', heightCm: 144, weightKg: null, deletedAt: ts('2026-01-01T00:00:00Z') },
    ],
  },
  { id: 'k2', name: 'Max', birthDate: '2020-01-01', sex: 'male', heights: [], deletedAt: ts('2026-02-01T00:00:00Z') },
];

describe('buildBackup', () => {
  const b = buildBackup({ email: 'x@y.z', family: { fatherHeightCm: 180 }, children, exportedAt: '2026-11-05T00:00:00Z' });

  it('converts Firestore timestamps to ISO strings and keeps trashed docs', () => {
    expect(b.children[0].createdAt).toBe('2026-04-19T16:00:00.000Z');
    expect(b.children[0].heights[0].deletedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(b.children[1].deletedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('sorts measurements by date and survives a JSON round trip', () => {
    expect(b.children[0].heights.map((h) => h.id)).toEqual(['h1', 'h2']);
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
    expect(backupStats(b)).toEqual({ children: 2, measurements: 2 });
  });
});

describe('toCsv', () => {
  const csv = toCsv(buildBackup({ email: null, family: null, children }));
  const lines = csv.replace('﻿', '').trim().split('\r\n');

  it('writes a header plus one row per measurement', () => {
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('child,birth_date,sex,measurement_date')).toBe(true);
  });

  it('quotes cells with commas and quotes, and marks trashed rows', () => {
    expect(csv).toContain('"after ""camp"", tall"');
    expect(lines[1]).toContain(',yes,');
    expect(lines[2]).not.toContain(',yes,');
  });

  it('includes imperial and metric heights', () => {
    expect(lines[2]).toContain(`4'11"`);
    expect(lines[2]).toContain('59.06');
    expect(lines[2]).toContain('150');
  });
});

describe('planRestore', () => {
  const backup = JSON.parse(JSON.stringify(buildBackup({ email: null, family: null, children })));

  it('only plans documents that are missing', () => {
    const plan = planRestore(backup, {
      childIds: new Set(['k1']),
      heightIdsByChild: new Map([['k1', new Set(['h1'])]]),
    });
    expect(plan.children.map((c) => c.id)).toEqual(['k2']);
    expect(plan.heights.map((x) => x.height.id)).toEqual(['h2']);
  });

  it('plans nothing when everything exists', () => {
    const plan = planRestore(backup, {
      childIds: new Set(['k1', 'k2']),
      heightIdsByChild: new Map([['k1', new Set(['h1', 'h2'])]]),
    });
    expect(plan).toEqual({ children: [], heights: [] });
  });

  it('rejects files that are not backups', () => {
    expect(() => planRestore({ foo: 1 }, { childIds: new Set(), heightIdsByChild: new Map() })).toThrow();
  });
});

describe('docFields / toPlain', () => {
  it('strips id and nested heights', () => {
    expect(docFields({ id: 'x', heights: [], name: 'Sam' })).toEqual({ name: 'Sam' });
  });
  it('passes plain values through', () => {
    expect(toPlain({ a: [1, null, 'x'] })).toEqual({ a: [1, null, 'x'] });
  });
});
