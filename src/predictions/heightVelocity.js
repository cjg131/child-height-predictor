// heightVelocity.js — compute growth velocity and detect peak height velocity (PHV).
//
// BACKGROUND
// Adult-height prediction tightens a lot when you know "where in puberty" the
// child is. The single best proxy without an X-ray is peak height velocity
// (PHV), which is the moment growth speed peaks during adolescence and marks
// the transition from the climbing limb of puberty (lots of growth left) to
// the descending limb (very little growth left).
//
// METHOD
// Given a list of measurements sorted by date, compute velocity between each
// adjacent pair in cm/year. To avoid noise from short intervals and
// measurement error, we require at least 90 days between points before we
// trust the velocity. Then:
//
// 1. Smooth the raw velocity series with a 3-point moving average.
// 2. Find the maximum velocity in the smoothed series. If the max is at least
//    ~7 cm/yr (typical PHV) AND subsequent velocities have declined to below
//    ~5 cm/yr, we call it "post-PHV". If the max is still recent and growth
//    is still fast, we call it "at PHV" or "pre-PHV" depending on prior trend.
// 3. If there's only one interval or all intervals are very short, the state
//    is "insufficient data".
//
// PUBLISHED REFERENCES (used for thresholds only, not clinical cutoffs)
//   Boys: PHV ~9.5 cm/yr, typical age 13-14
//   Girls: PHV ~8.3 cm/yr, typical age 11-12
//
// USAGE BY PREDICTORS
// The returned state plus "months since PHV" is used by cdcPercentileProjection
// to shape its SD and point estimate, and by khamisRoche to tighten its SD
// once the PHV has been crossed.

import { ageInYears } from '../lib/units.js';
import { timeOf, childHeightCm } from './constants.js';

/** Days between two epoch-ms timestamps. */
function daysBetweenMs(t0, t1) {
  return (t1 - t0) / (1000 * 60 * 60 * 24);
}

/**
 * Compute height velocity history and PHV state.
 *
 * @param {Object} params
 * @param {string} params.sex - 'male' or 'female'
 * @param {string} params.birthDate - ISO date
 * @param {Array} params.heights - [{measurementDate, heightCm}, ...] sorted ascending
 * @returns {Object} {
 *   velocities: [{startDate, endDate, cmPerYear, midAgeYears}, ...],
 *   smoothed:   [{midAgeYears, cmPerYear}, ...],
 *   peak:       {cmPerYear, midAgeYears} | null,
 *   state:      'insufficient' | 'pre-phv' | 'at-phv' | 'post-phv',
 *   monthsSincePhv: number | null,
 *   lastVelocityCmPerYear: number | null,
 * }
 */
export function heightVelocity({ sex, birthDate, heights }) {
  // Normalize dates to epoch ms before sorting. localeCompare() only works on
  // strings and throws on the Date objects that ageInYears / cdcStatureZ /
  // boneAgeProjection all happily accept -- so a caller passing Dates would
  // crash here while every other predictor worked.
  const sorted = (heights || [])
    .map((h) => {
      if (!h || h.measurementDate == null) return null;
      const t = timeOf(h.measurementDate);
      const cm = childHeightCm(h.heightCm);
      if (t == null || cm == null) return null;
      return { ...h, _t: t, heightCm: cm };
    })
    .filter(Boolean)
    .sort((a, b) => a._t - b._t);

  if (sorted.length < 2) {
    return {
      velocities: [],
      smoothed: [],
      peak: null,
      state: 'insufficient',
      monthsSincePhv: null,
      lastVelocityCmPerYear: null,
    };
  }

  // Pair each measurement with the most recent EARLIER one at least 90 days
  // back, rather than only with its immediate predecessor. Measuring monthly is
  // good practice, but the old adjacent-pairs-only loop discarded every such
  // interval as "too short" and reported `insufficient` forever -- silently
  // disabling PHV detection for the most diligently tracked children.
  const MIN_INTERVAL_DAYS = 90;
  const velocities = [];
  let anchor = 0;
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    // Advance the anchor as far forward as we can while keeping the gap valid,
    // so intervals stay as short as possible without dropping below the floor.
    while (
      anchor + 1 < i
      && daysBetweenMs(sorted[anchor + 1]._t, b._t) >= MIN_INTERVAL_DAYS
    ) {
      anchor++;
    }
    const a = sorted[anchor];
    const days = daysBetweenMs(a._t, b._t);
    if (days < MIN_INTERVAL_DAYS) continue;

    const years = days / 365.25;
    const cmPerYear = (b.heightCm - a.heightCm) / years;
    const midAge = (
      ageInYears(birthDate, a.measurementDate) + ageInYears(birthDate, b.measurementDate)
    ) / 2;
    velocities.push({
      startDate: a.measurementDate,
      endDate: b.measurementDate,
      cmPerYear,
      midAgeYears: midAge,
    });
    anchor = i; // next interval starts from here
  }

  if (velocities.length === 0) {
    return {
      velocities: [],
      smoothed: [],
      peak: null,
      state: 'insufficient',
      monthsSincePhv: null,
      lastVelocityCmPerYear: null,
    };
  }

  // 3-point moving average
  const smoothed = velocities.map((v, i, arr) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(arr.length, i + 2);
    const window = arr.slice(lo, hi);
    const mean = window.reduce((s, x) => s + x.cmPerYear, 0) / window.length;
    return { midAgeYears: v.midAgeYears, cmPerYear: mean };
  });

  // Expected PHV magnitude thresholds
  const PHV_THRESHOLD = sex === 'female' ? 7.0 : 8.0;       // cm/yr to qualify
  const POST_PHV_THRESHOLD = 5.0;                            // cm/yr — growth slowed
  const PEAK_AGE_MIN = sex === 'female' ? 9.0 : 10.5;
  const PEAK_AGE_MAX = sex === 'female' ? 14.0 : 16.0;

  // Find the max RAW velocity within a plausible PHV age window. Raw is
  // better for peak detection because moving averages attenuate the peak.
  let peak = null;
  for (const v of velocities) {
    if (v.midAgeYears < PEAK_AGE_MIN || v.midAgeYears > PEAK_AGE_MAX) continue;
    if (!peak || v.cmPerYear > peak.cmPerYear) {
      peak = { cmPerYear: v.cmPerYear, midAgeYears: v.midAgeYears };
    }
  }

  const last = smoothed[smoothed.length - 1];
  const lastVelocityCmPerYear = last.cmPerYear;
  const ageNow = ageInYears(birthDate, sorted[sorted.length - 1].measurementDate);

  let state;
  let monthsSincePhv = null;

  if (peak && peak.cmPerYear >= PHV_THRESHOLD) {
    if (last.cmPerYear < POST_PHV_THRESHOLD && last.midAgeYears > peak.midAgeYears) {
      state = 'post-phv';
      monthsSincePhv = (ageNow - peak.midAgeYears) * 12;
    } else if (last.midAgeYears >= peak.midAgeYears && last.cmPerYear >= POST_PHV_THRESHOLD) {
      state = 'at-phv';
      monthsSincePhv = (ageNow - peak.midAgeYears) * 12;
    } else {
      state = 'pre-phv';
    }
  } else {
    // No qualifying peak yet. Check if the child is too old to still be pre-pubertal.
    if (ageNow > PEAK_AGE_MAX && last.cmPerYear < 3) {
      state = 'post-phv';
      monthsSincePhv = null; // unknown, but clearly past it
    } else {
      state = 'pre-phv';
    }
  }

  return {
    velocities,
    smoothed,
    peak,
    state,
    monthsSincePhv,
    lastVelocityCmPerYear,
  };
}
