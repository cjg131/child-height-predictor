// Data-quality checks. Pure functions, no Firebase.
//
// Nothing here changes data. These checks only point at entries that look
// like typos or rounding so a person can decide whether to fix them. Bad
// inputs are the biggest source of bad predictions: one wrong reading can move
// the CDC and velocity signals more than any formula choice does.

import { ageInYears, formatFeetInches, cmToIn, localDateIso } from './units.js';
import { cdcStatureZ } from '../predictions/cdcPercentile.js';
import { sortByDate } from './predict.js';

const DAY_MS = 86400000;
const SHRINK_TOLERANCE_CM = 1.0;   // normal measuring error is about 0.5 cm
const FLAT_MIN_DAYS = 90;          // under ~3 months a flat reading is normal
const FLAT_MAX_AGE_YEARS = 15;     // older boys can legitimately plateau
const MIN_GAP_FOR_RATE_DAYS = 30;  // shorter gaps are dominated by error
// Two home readings can each be off by about 0.5 to 0.75 cm, so a pair can
// show up to ~1.5 cm of "growth" that isn't real. Over a 5-week gap that
// noise alone looks like a 15 cm/year pace, so the pace check allows this
// much on top of the fastest plausible growth before flagging.
const PAIR_ERROR_CM = 1.5;

/**
 * Fastest plausible growth rate (cm/year) at a given age. Infants grow about
 * 25 cm in year one; the pubertal peak tops out around 10 to 12 cm/year.
 * These ceilings sit well above normal so only real outliers trip them.
 */
export function maxPlausibleRateCmPerYear(ageYears) {
  if (ageYears < 0.5) return 65;   // newborn length readings are rough, and growth is ~4 cm/month
  if (ageYears < 1) return 40;
  if (ageYears < 2) return 20;
  return 15;
}

const daysBetween = (a, b) => (new Date(b) - new Date(a)) / DAY_MS;
const inches = (cm) => `${cmToIn(Math.abs(cm)).toFixed(1)} in`;

/** Growth between two readings beyond what is plausible plus measuring error. */
function implausibleGrowth(fromCm, toCm, gapDays, ageYears) {
  if (gapDays < MIN_GAP_FOR_RATE_DAYS) return false;
  const allowed = (maxPlausibleRateCmPerYear(ageYears) * gapDays) / 365.25 + PAIR_ERROR_CM;
  return toCm - fromCm > allowed;
}

/**
 * Check a measurement before it is saved.
 *
 * @param {Object} p
 * @param {{birthDate:string, sex:string}} p.child
 * @param {Array} p.existing - the child's saved measurements
 * @param {string} p.measurementDate - ISO date
 * @param {number} p.heightCm
 * @param {string} [p.today] - ISO date, injectable for tests
 * @returns {{level:'block'|'warn', message:string}[]}
 */
export function checkNewMeasurement({ child, existing = [], measurementDate, heightCm, today }) {
  const out = [];
  const todayIso = today || localDateIso();
  if (!measurementDate || !Number.isFinite(heightCm) || heightCm <= 0) {
    return [{ level: 'block', message: 'Enter a date and a height.' }];
  }
  if (measurementDate < child.birthDate) {
    out.push({ level: 'block', message: `Date is before ${child.name || 'the child'} was born.` });
    return out;
  }
  if (measurementDate > todayIso) {
    out.push({ level: 'warn', message: 'Date is in the future.' });
  }

  const sorted = sortByDate(existing);
  if (sorted.some((h) => h.measurementDate === measurementDate)) {
    out.push({ level: 'warn', message: `There is already a measurement on ${measurementDate}. This will add a second one.` });
  }

  const before = sorted.filter((h) => h.measurementDate < measurementDate).pop();
  const after = sorted.find((h) => h.measurementDate > measurementDate);

  if (before && heightCm < before.heightCm - SHRINK_TOLERANCE_CM) {
    out.push({
      level: 'warn',
      message: `That's ${inches(before.heightCm - heightCm)} shorter than on ${before.measurementDate} (${formatFeetInches(before.heightCm)}). Typo?`,
    });
  }
  if (after && heightCm > after.heightCm + SHRINK_TOLERANCE_CM) {
    out.push({
      level: 'warn',
      message: `That's taller than the later reading on ${after.measurementDate} (${formatFeetInches(after.heightCm)}).`,
    });
  }

  if (before) {
    const gap = daysBetween(before.measurementDate, measurementDate);
    const ageY = ageInYears(child.birthDate, measurementDate);
    if (implausibleGrowth(before.heightCm, heightCm, gap, ageY)) {
      const rate = ((heightCm - before.heightCm) / gap) * 365.25;
      out.push({
        level: 'warn',
        message: `That's ${inches(heightCm - before.heightCm)} of growth since ${before.measurementDate}, a pace of ${cmToIn(rate).toFixed(1)} in/year. Even a growth spurt rarely tops ${cmToIn(maxPlausibleRateCmPerYear(ageY)).toFixed(1)} in/year.`,
      });
    }
  }

  const z = cdcStatureZ({ sex: child.sex, birthDate: child.birthDate, measurementDate, heightCm });
  if (z && Math.abs(z.z) > 4) {
    out.push({
      level: 'warn',
      message: `That height is far off the growth chart for this age (z = ${z.z.toFixed(1)}). Check feet vs inches.`,
    });
  }
  return out;
}

/**
 * Review a child's saved history for entries worth a second look.
 *
 * @returns {{kind:string, date:string, message:string}[]}
 */
export function auditChild(child, heights) {
  const sorted = sortByDate(heights);
  const flags = [];

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const gap = daysBetween(a.measurementDate, b.measurementDate);
    const ageY = ageInYears(child.birthDate, b.measurementDate);

    if (a.measurementDate === b.measurementDate) {
      flags.push({ kind: 'duplicate-date', date: b.measurementDate,
        message: `Two measurements on ${b.measurementDate}.` });
    }

    if (b.heightCm < a.heightCm - SHRINK_TOLERANCE_CM) {
      flags.push({ kind: 'shrink', date: b.measurementDate,
        message: `${b.measurementDate} is ${inches(a.heightCm - b.heightCm)} shorter than ${a.measurementDate}.` });
    }

    if (implausibleGrowth(a.heightCm, b.heightCm, gap, ageY)) {
      const rate = ((b.heightCm - a.heightCm) / gap) * 365.25;
      flags.push({ kind: 'fast', date: b.measurementDate,
        message: `${inches(b.heightCm - a.heightCm)} of growth between ${a.measurementDate} and ${b.measurementDate} (${cmToIn(rate).toFixed(1)} in/year pace). One of the two is likely off.` });
    }
  }

  // Runs of identical readings. Judged across the whole run, so three equal
  // readings a few weeks apart still count as one long flat stretch.
  let runStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const same = i < sorted.length && Math.abs(sorted[i].heightCm - sorted[runStart].heightCm) < 0.01;
    if (same) continue;
    const first = sorted[runStart];
    const last = sorted[i - 1];
    const span = daysBetween(first.measurementDate, last.measurementDate);
    if (i - 1 > runStart && span >= FLAT_MIN_DAYS
      && ageInYears(child.birthDate, last.measurementDate) < FLAT_MAX_AGE_YEARS) {
      const n = i - runStart;
      flags.push({ kind: 'flat', date: last.measurementDate,
        message: `No growth recorded from ${first.measurementDate} to ${last.measurementDate} (${Math.round(span / 30.44)} months, ${n === 2 ? 'both' : `all ${n}`} ${formatFeetInches(first.heightCm)}). Probably a rounded reading.` });
    }
    runStart = i;
  }

  // Puberty only moves forward. A lower Tanner stage after a higher one
  // usually means one of the two was a guess.
  let maxTanner = null;
  for (const h of sorted) {
    const t = Number(h.tannerStage);
    if (!Number.isInteger(t) || t < 1 || t > 5) continue;
    if (maxTanner && t < maxTanner.stage) {
      flags.push({ kind: 'tanner-backward', date: h.measurementDate,
        message: `Tanner stage ${t} on ${h.measurementDate}, after stage ${maxTanner.stage} on ${maxTanner.date}. Puberty stages don't go backward; one of these is probably off.` });
    }
    if (!maxTanner || t > maxTanner.stage) maxTanner = { stage: t, date: h.measurementDate };
  }

  return flags;
}

/**
 * Check parent data across children. Before the Parents page existed, parent
 * facts were typed into each child's profile, so they can disagree. Once the
 * family record holds a value it wins for every child and the per-child
 * copies stop mattering.
 *
 * @returns {{field:string, message:string}[]}
 */
export function auditFamily(children, family) {
  const fields = [
    { key: 'fatherHeightCm', label: "Dad's height", fmt: formatFeetInches },
    { key: 'motherHeightCm', label: "Mom's height", fmt: formatFeetInches },
    { key: 'fatherMaturation', label: "Dad's puberty timing", fmt: (v) => v },
    { key: 'motherMenarcheAgeYears', label: "Mom's age at first period", fmt: (v) => `${v}` },
  ];
  const flags = [];
  for (const f of fields) {
    const fam = family?.[f.key];
    if (fam !== undefined && fam !== null && fam !== '') continue;
    const byValue = new Map();
    for (const c of children) {
      const v = c[f.key];
      if (v === undefined || v === null || v === '') continue;
      const key = typeof v === 'number' ? v.toFixed(2) : String(v);
      if (!byValue.has(key)) byValue.set(key, { value: v, names: [] });
      byValue.get(key).names.push(c.name);
    }
    if (byValue.size > 1) {
      const parts = [...byValue.values()].map((g) => `${f.fmt(g.value)} on ${g.names.join(' and ')}`);
      flags.push({
        field: f.key,
        message: `${f.label} is ${parts.join(', but ')}. Set it once on the Parents page and every kid will use the same value.`,
      });
    }
  }
  return flags;
}
