// Pure helpers that turn a child + their measurement history into
// predictions, projected growth paths, and prediction history.
//
// Kept free of Firebase imports so they run in node tests and verify-math.

import { combinePredictions } from '../predictions/combine.js';
import {
  statureLmsAtAge, valueFromLMS, cdcStatureZ, zFromLMS,
  CDC_MIN_AGE_MONTHS, CDC_MAX_AGE_MONTHS,
} from '../predictions/cdcPercentile.js';
import { ageInYears } from './units.js';

/** Sort measurements oldest first without mutating the caller's array. */
export function sortByDate(heights) {
  return (heights || [])
    .slice()
    .sort((a, b) => (a.measurementDate < b.measurementDate ? -1
      : a.measurementDate > b.measurementDate ? 1 : 0));
}

/**
 * Run the full prediction engine for a child using the measurements given.
 * `child` must already carry the resolved parent fields (see family.js).
 */
export function predictForChild(child, heights) {
  const sorted = sortByDate(heights);
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  return combinePredictions({
    sex: child.sex,
    birthDate: child.birthDate,
    measurementDate: latest?.measurementDate ?? null,
    currentHeightCm: latest?.heightCm ?? null,
    currentWeightKg: latest?.weightKg ?? null,
    motherHeightCm: child.motherHeightCm ?? null,
    fatherHeightCm: child.fatherHeightCm ?? null,
    siblings: child.siblings || [],
    boneAgeYears: latest?.boneAgeYears ?? null,
    tannerStage: latest?.tannerStage ?? null,
    motherMenarcheAgeYears: child.motherMenarcheAgeYears ?? null,
    fatherMaturation: child.fatherMaturation ?? null,
    heights: sorted,
  });
}

/**
 * What the app would have predicted right after each measurement was taken,
 * using only the data available at that moment. Shows how the estimate has
 * moved and narrowed as data came in.
 *
 * Only measurements from age 2 on are included: before that the CDC and
 * Khamis-Roche methods can't run, so every early point would just repeat the
 * parent-only estimate.
 *
 * @returns {{measurementDate:string, ageYears:number, predictedCm:number,
 *            lowCm:number, highCm:number, pointCount:number}[]}
 */
export function predictionHistory(child, heights) {
  const sorted = sortByDate(heights);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i];
    const ageY = ageInYears(child.birthDate, h.measurementDate);
    if (ageY * 12 < CDC_MIN_AGE_MONTHS - 0.1) continue;
    const p = predictForChild(child, sorted.slice(0, i + 1));
    const c = p?.consensus;
    if (!c || !Number.isFinite(c.predictedAdultHeightCm)) continue;
    out.push({
      measurementDate: h.measurementDate,
      ageYears: ageY,
      predictedCm: c.predictedAdultHeightCm,
      lowCm: c.rangeLowCm,
      highCm: c.rangeHighCm,
      pointCount: c.pointCount,
    });
  }
  return out;
}

/**
 * Projected growth path from the latest measurement to age 20.
 *
 * The child starts at their current CDC z-score and glides linearly in
 * z-space to the z-score that matches the predicted adult height (and its
 * low/high range) at 20. Moving in z-space rather than inches keeps the curve
 * shaped like a real growth curve: the pubertal spurt and the plateau come
 * from the CDC reference, not from a straight line.
 *
 * @returns {{ageYears:number, midCm:number, lowCm:number, highCm:number}[]|null}
 */
export function projectionPath({ sex, birthDate, latest, consensus, stepYears = 0.25 }) {
  if (!latest || !consensus) return null;
  const startAgeMos = ageInYears(birthDate, latest.measurementDate) * 12;
  if (startAgeMos < CDC_MIN_AGE_MONTHS - 0.1 || startAgeMos >= CDC_MAX_AGE_MONTHS) return null;

  const start = cdcStatureZ({
    sex, birthDate, measurementDate: latest.measurementDate, heightCm: latest.heightCm,
  });
  if (!start) return null;

  const adult = statureLmsAtAge(sex, CDC_MAX_AGE_MONTHS);
  const zEnd = (cm) => zFromLMS(cm, adult.L, adult.M, adult.S);
  const targets = {
    mid: zEnd(consensus.predictedAdultHeightCm),
    low: zEnd(consensus.rangeLowCm),
    high: zEnd(consensus.rangeHighCm),
  };
  if (![targets.mid, targets.low, targets.high].every(Number.isFinite)) return null;

  const startY = startAgeMos / 12;
  const endY = CDC_MAX_AGE_MONTHS / 12;
  const span = endY - startY;
  const ages = [startY];
  for (let a = Math.ceil(startY / stepYears) * stepYears; a < endY; a += stepYears) {
    if (a > startY + 1e-9) ages.push(a);
  }
  ages.push(endY);

  const raw = ages.map((a) => {
    const t = span > 0 ? (a - startY) / span : 1;
    const lms = statureLmsAtAge(sex, a * 12);
    const at = (zTarget) => valueFromLMS(start.z + (zTarget - start.z) * t, lms.L, lms.M, lms.S);
    return {
      ageYears: a,
      midCm: at(targets.mid),
      lowCm: at(targets.low),
      highCm: at(targets.high),
    };
  });

  // Near 20 the CDC median is almost flat, so a path drifting down in z can
  // dip by a hundredth of a millimetre before the end. Kids don't shrink:
  // hold each line non-decreasing, capped at its own adult endpoint so the
  // path still lands exactly on the prediction.
  const last = raw[raw.length - 1];
  for (const key of ['midCm', 'lowCm', 'highCm']) {
    for (let i = 1; i < raw.length; i++) {
      raw[i][key] = Math.min(Math.max(raw[i][key], raw[i - 1][key]), Math.max(last[key], raw[0][key]));
    }
  }
  return raw;
}

/**
 * Growth rate between consecutive measurements, in cm per year. Returns a map
 * from measurement id to the rate since the previous measurement (null for
 * the first one or when the gap is under 30 days, where measuring error
 * swamps the signal).
 */
export function growthRates(heights) {
  const sorted = sortByDate(heights);
  const out = {};
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { out[sorted[i].id] = null; continue; }
    const a = sorted[i - 1], b = sorted[i];
    const days = (new Date(b.measurementDate) - new Date(a.measurementDate)) / 86400000;
    out[b.id] = days >= 30 ? ((b.heightCm - a.heightCm) / days) * 365.25 : null;
  }
  return out;
}
