// Backup file formats. Pure functions, no Firebase.
//
// Two formats:
//   - JSON: the complete record (every field on every document, including
//     trashed ones), suitable for restoring.
//   - CSV: one row per measurement, in both metric and imperial, for opening
//     in Excel. Read-only convenience; restore uses the JSON.

import { ageInYears, cmToIn, kgToLb, formatFeetInches } from './units.js';
import { sortByDate } from './predict.js';

export const BACKUP_FORMAT_VERSION = 1;

/** Firestore Timestamps become ISO strings so the file is plain JSON. */
export function toPlain(value) {
  if (value == null) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

/**
 * @param {Object} p
 * @param {string} p.email
 * @param {Object|null} p.family
 * @param {Array<Object & {heights:Array}>} p.children - including trashed ones
 */
export function buildBackup({ email, family, children, exportedAt }) {
  return {
    app: 'child-height-predictor',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    account: email || null,
    family: toPlain(family) || null,
    children: children.map((c) => ({
      ...toPlain({ ...c, heights: undefined }),
      heights: sortByDate(c.heights || []).map(toPlain),
    })),
  };
}

export function backupStats(backup) {
  const kids = backup.children || [];
  return {
    children: kids.length,
    measurements: kids.reduce((n, c) => n + (c.heights || []).length, 0),
  };
}

const CSV_COLUMNS = [
  'child', 'birth_date', 'sex', 'measurement_date', 'age_years',
  'height_ft_in', 'height_in', 'height_cm', 'weight_lb', 'weight_kg',
  'tanner_stage', 'shoe_size_us', 'bone_age_years', 'note', 'in_trash',
  'child_id', 'measurement_id',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (v, digits) => (Number.isFinite(v) ? Number(v.toFixed(digits)) : '');

export function toCsv(backup) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const c of backup.children || []) {
    for (const h of c.heights || []) {
      const hc = Number(h.heightCm);
      const wk = h.weightKg == null ? null : Number(h.weightKg);
      rows.push([
        c.name, c.birthDate, c.sex, h.measurementDate,
        num(ageInYears(c.birthDate, h.measurementDate), 2),
        Number.isFinite(hc) ? formatFeetInches(hc) : '',
        num(cmToIn(hc), 2), num(hc, 2),
        wk == null ? '' : num(kgToLb(wk), 2), wk == null ? '' : num(wk, 2),
        h.tannerStage ?? '', h.shoeSizeUs ?? '', h.boneAgeYears ?? '',
        h.note ?? '',
        (h.deletedAt || c.deletedAt) ? 'yes' : '',
        c.id, h.id,
      ].map(csvCell).join(','));
    }
  }
  // Leading BOM so Excel opens the file as UTF-8 and keeps the ' and " marks.
  return '﻿' + rows.join('\r\n') + '\r\n';
}

/**
 * Work out what a restore would add, without writing anything. A restore
 * only ever re-creates documents that are missing; it never overwrites a
 * document that exists, so it cannot clobber newer edits.
 *
 * @param {Object} backup - parsed JSON backup
 * @param {{childIds:Set<string>, heightIdsByChild:Map<string,Set<string>>}} current
 * @returns {{children:Object[], heights:{childId:string, height:Object}[]}}
 */
export function planRestore(backup, current) {
  if (!backup || backup.app !== 'child-height-predictor' || !Array.isArray(backup.children)) {
    throw new Error("That file isn't a Child Height Predictor backup.");
  }
  const plan = { children: [], heights: [] };
  for (const c of backup.children) {
    if (!c.id) continue;
    if (!current.childIds.has(c.id)) plan.children.push(c);
    const have = current.heightIdsByChild.get(c.id) || new Set();
    for (const h of c.heights || []) {
      if (h.id && !have.has(h.id)) plan.heights.push({ childId: c.id, height: h });
    }
  }
  return plan;
}

/** Strip the id and the nested heights before writing a document back. */
export function docFields(obj) {
  const rest = { ...obj };
  delete rest.id;
  delete rest.heights;
  return rest;
}
