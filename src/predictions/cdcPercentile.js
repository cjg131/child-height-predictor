// CDC percentile / LMS math and percentile-tracking projection.
//
// The CDC 2000 growth charts are parameterized by three numbers at each
// half-month point: L (power), M (median), and S (coefficient of variation).
// Given an observed value X these produce a z-score via the Box-Cox / Cole
// transform, which maps the skewed age-specific distribution onto a standard
// normal. See src/growth-data/cdc-stature-lms.js for the tables.
//
//   z = ((X/M)^L - 1) / (L*S)    when L != 0
//   z = ln(X/M) / S              when L == 0
//
// And to invert:
//   X = M * (1 + L*S*z)^(1/L)    when L != 0
//   X = M * exp(S*z)             when L == 0
//
// Percentile tracking for adult height:
// The simplest trajectory forecast is "whatever percentile you are now, you
// will finish at." So look up the child's current z-score, then invert the
// LMS at age 240 months (20 years) to get the predicted adult height. Studies
// using the Berkeley Longitudinal dataset have shown this to be roughly as
// accurate as Khamis-Roche for children past age 7, and it requires no
// parental data. Accuracy degrades in the puberty window because tempo
// differences (early vs. late maturers) pull the trajectory off the rail.

import { CDC_STATURE_LMS } from '../growth-data/cdc-stature-lms.js';
import { ageInMonths } from '../lib/units.js';

/** Interpolate an LMS row at an arbitrary ageMonths. */
function lmsAtAge(table, ageMonths) {
  if (!table.length) throw new Error('lmsAtAge: empty table');
  if (ageMonths <= table[0].ageMonths) return table[0];
  if (ageMonths >= table[table.length - 1].ageMonths) return table[table.length - 1];
  // Binary search for the segment.
  let lo = 0, hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].ageMonths <= ageMonths) lo = mid;
    else hi = mid;
  }
  const a = table[lo], b = table[hi];
  const t = (ageMonths - a.ageMonths) / (b.ageMonths - a.ageMonths);
  return {
    ageMonths,
    L: a.L + (b.L - a.L) * t,
    M: a.M + (b.M - a.M) * t,
    S: a.S + (b.S - a.S) * t,
  };
}

// The CDC 2000 stature-for-age tables cover 24-240 months. Below 24 months the
// correct reference is the WHO 0-2 length-for-age standard, which we do not
// ship. Clamping to the 24-month row instead of refusing silently reports a
// normal 14-month-old as 0.8th percentile, so we refuse.
export const CDC_MIN_AGE_MONTHS = 24;
export const CDC_MAX_AGE_MONTHS = 240;

// ageInMonths() divides elapsed milliseconds by a 365.25-day year, so a child
// measured on their exact 2nd birthday computes as 23.98 months, not 24.0. A
// strict >= 24 test would refuse them. This tolerance (~3 days) absorbs that
// drift at both ends without admitting anyone meaningfully outside the table.
const AGE_EPSILON_MONTHS = 0.1;

/** True when an age falls inside the CDC 2-20 stature table. */
export function inTableRange(ageMonths) {
  return (
    Number.isFinite(ageMonths)
    && ageMonths >= CDC_MIN_AGE_MONTHS - AGE_EPSILON_MONTHS
    && ageMonths <= CDC_MAX_AGE_MONTHS + AGE_EPSILON_MONTHS
  );
}

/**
 * Public LMS lookup for a sex and age, clamped to the 2-20 table. Used by the
 * chart to draw a projected growth path; the clamping is fine there because
 * callers only ask for ages inside the table.
 */
export function statureLmsAtAge(sex, ageMonths) {
  return lmsAtAge(tableForSex(sex), ageMonths);
}

/** Compute a z-score given LMS parameters and an observed value X. */
export function zFromLMS(X, L, M, S) {
  if (L === 0) return Math.log(X / M) / S;
  return (Math.pow(X / M, L) - 1) / (L * S);
}

/** Invert LMS: given a z-score and LMS, return the value X. */
export function valueFromLMS(z, L, M, S) {
  if (L === 0) return M * Math.exp(S * z);
  const base = 1 + L * S * z;
  if (base <= 0) {
    // Only reachable for absurd z. Returning M here would launder nonsense
    // into a plausible-looking median, so surface it as NaN instead.
    return NaN;
  }
  return M * Math.pow(base, 1 / L);
}

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 approximation.
 * Accurate to about 1.5e-7 across the real line — more than enough for
 * percentile display.
 */
export function normalCdf(z) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/** Turn a z-score into a percentile in [0, 100]. */
export function zToPercentile(z) {
  return normalCdf(z) * 100;
}

/** The two CDC tables by sex key. */
function tableForSex(sex) {
  if (sex === 'male') return CDC_STATURE_LMS.boys;
  if (sex === 'female') return CDC_STATURE_LMS.girls;
  throw new Error(`tableForSex: sex must be 'male' or 'female', got ${sex}`);
}

/**
 * Compute the CDC stature-for-age z-score and percentile for a single
 * measurement.
 *
 * @param {Object} params
 * @param {'male'|'female'} params.sex
 * @param {string|Date} params.birthDate
 * @param {string|Date} params.measurementDate
 * @param {number} params.heightCm
 */
export function cdcStatureZ({ sex, birthDate, measurementDate, heightCm }) {
  const ageMos = ageInMonths(birthDate, measurementDate);
  if (!inTableRange(ageMos)) return null;

  const h = Number(heightCm);
  if (!Number.isFinite(h) || h <= 0) return null;

  const lms = lmsAtAge(tableForSex(sex), ageMos);
  const z = zFromLMS(h, lms.L, lms.M, lms.S);
  if (!Number.isFinite(z)) return null;

  return {
    ageMonths: ageMos,
    z,
    percentile: zToPercentile(z),
    lms,
  };
}

/**
 * Predict adult height by holding the child's current CDC stature percentile
 * constant to age 20.
 *
 * If multiple recent measurements are available, pass the most recent. The
 * function also accepts an optional weighted average of the last N points
 * through `zOverride` so callers can smooth out a single noisy reading.
 */
export function cdcPercentileProjection({
  sex,
  birthDate,
  measurementDate,
  heightCm,
  zOverride,               // optional: use this z instead of recomputing
}) {
  let z;
  let ageMos;
  let percentile;

  if (zOverride != null) {
    z = Number(zOverride);
    ageMos = ageInMonths(birthDate, measurementDate);
    if (!Number.isFinite(z) || !inTableRange(ageMos)) return null;
    percentile = zToPercentile(z);
  } else {
    const result = cdcStatureZ({ sex, birthDate, measurementDate, heightCm });
    if (result == null) return null;      // out of table range or bad input
    z = result.z;
    ageMos = result.ageMonths;
    percentile = result.percentile;
  }

  const adultLms = lmsAtAge(tableForSex(sex), CDC_MAX_AGE_MONTHS);  // 20 years old
  const adultHeightCm = valueFromLMS(z, adultLms.L, adultLms.M, adultLms.S);
  if (!Number.isFinite(adultHeightCm)) return null;

  // Published standard error for percentile-holding projection is roughly
  // 3cm at age 8 and narrows as the child ages. We model a gentle decay.
  const sdCm = Math.max(2.0, 5.0 - 0.25 * (ageMos / 12));

  return {
    method: 'cdc-percentile',
    currentAgeMonths: ageMos,
    currentPercentile: percentile,
    currentZ: z,
    predictedAdultHeightCm: adultHeightCm,
    rangeLowCm: adultHeightCm - 2 * sdCm,
    rangeHighCm: adultHeightCm + 2 * sdCm,
    sdCm,
    inputs: { sex, birthDate, measurementDate, heightCm },
  };
}

/**
 * Generate the CDC percentile curves (3rd, 10th, 25th, 50th, 75th, 90th, 97th)
 * across an age range, useful for chart overlays.
 *
 * @returns {{ageMonths:number, p3:number, p10:number, p25:number, p50:number, p75:number, p90:number, p97:number}[]}
 */
export function cdcPercentileCurves(sex, { startMonths = 24, endMonths = 240, stepMonths = 6 } = {}) {
  const table = tableForSex(sex);
  const zByP = {
    p3:  -1.8808,
    p10: -1.2816,
    p25: -0.6745,
    p50:  0,
    p75:  0.6745,
    p90:  1.2816,
    p97:  1.8808,
  };
  const rows = [];
  for (let ageMos = startMonths; ageMos <= endMonths; ageMos += stepMonths) {
    const lms = lmsAtAge(table, ageMos);
    const row = { ageMonths: ageMos };
    for (const [key, z] of Object.entries(zByP)) {
      row[key] = valueFromLMS(z, lms.L, lms.M, lms.S);
    }
    rows.push(row);
  }
  return rows;
}
