// BMI trajectory + adiposity rebound detector.
//
// Normal BMI trajectory in childhood:
//   - Rises steeply from birth to ~1 year
//   - Declines from ~1 to 5-7 years (the "BMI nadir" or adiposity rebound)
//   - Rises again through puberty into adulthood
//
// The age at adiposity rebound (AR) is a well-established predictor of
// adult BMI and also correlates with pubertal timing:
//   - Early rebound (<5.0 yrs)    -> earlier puberty, higher adult BMI,
//                                    tends to finish shorter than percentile
//                                    tracking would suggest.
//   - Normal rebound (5.0-6.5 yrs) -> typical trajectory.
//   - Late rebound (>6.5 yrs)     -> later puberty, more growth time,
//                                    often finishes taller than current
//                                    percentile tracking suggests.
//
// Refs: Rolland-Cachera et al. 1984 (AJCN); Williams & Goulding 2009 (IJO);
//       Koyama et al. 2014 (J Epidemiol).
//
// We detect rebound as the minimum of the smoothed BMI curve within the
// 2-10 year window, requiring at least one rising point afterwards to
// confirm it's a true turnaround (not just the latest reading).

import { ageInMonths } from '../lib/units.js';

const SMOOTH_WINDOW = 3;

function movingAverage(values, window = SMOOTH_WINDOW) {
  const out = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    let sum = 0, n = 0;
    for (let j = lo; j <= hi; j++) { sum += values[j]; n++; }
    out.push(sum / n);
  }
  return out;
}

function classifyRebound(ageYears) {
  if (ageYears < 5.0) return 'early';
  if (ageYears <= 6.5) return 'normal';
  return 'late';
}

/**
 * Compute BMI trajectory and adiposity rebound.
 */
export function bmiTrajectory({ birthDate, heights }) {
  const withBmi = [];
  for (const h of heights || []) {
    if (h.heightCm == null || h.weightKg == null) continue;
    const ageYears = ageInMonths(birthDate, h.measurementDate) / 12;
    const heightM = h.heightCm / 100;
    const bmi = h.weightKg / (heightM * heightM);
    if (!Number.isFinite(bmi) || bmi <= 0) continue;
    withBmi.push({ ageYears, bmi });
  }
  withBmi.sort((a, b) => a.ageYears - b.ageYears);

  if (withBmi.length === 0) {
    return {
      series: [],
      smoothed: [],
      rebound: null,
      currentBmi: null,
      currentAgeYears: null,
      bmiTrendPerYear: null,
      state: 'insufficient',
    };
  }

  const current = withBmi[withBmi.length - 1];

  if (withBmi.length < 3) {
    return {
      series: withBmi,
      smoothed: withBmi,
      rebound: null,
      currentBmi: current.bmi,
      currentAgeYears: current.ageYears,
      bmiTrendPerYear: null,
      state: 'insufficient',
    };
  }

  const bmiValues = withBmi.map((p) => p.bmi);
  const smoothedBmi = movingAverage(bmiValues);
  const smoothed = withBmi.map((p, i) => ({ ageYears: p.ageYears, bmi: smoothedBmi[i] }));

  let minIdx = -1;
  let minVal = Infinity;
  for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    if (p.ageYears < 2 || p.ageYears > 10) continue;
    if (p.bmi < minVal) { minVal = p.bmi; minIdx = i; }
  }

  let rebound = null;
  let state = 'pre-rebound';

  if (minIdx >= 0) {
    let confirmed = false;
    for (let j = minIdx + 1; j < smoothed.length; j++) {
      if (smoothed[j].bmi > smoothed[minIdx].bmi) { confirmed = true; break; }
    }
    if (confirmed) {
      const reboundAge = smoothed[minIdx].ageYears;
      rebound = {
        ageYears: reboundAge,
        bmi: smoothed[minIdx].bmi,
        timing: classifyRebound(reboundAge),
      };
      state = 'rebound-detected';
    } else if (current.ageYears > 7.5) {
      state = 'post-rebound-only';
    }
  }

  let bmiTrendPerYear = null;
  if (smoothed.length >= 2) {
    const last = smoothed[smoothed.length - 1];
    for (let i = smoothed.length - 2; i >= 0; i--) {
      const dy = last.ageYears - smoothed[i].ageYears;
      if (dy >= 0.75) {
        bmiTrendPerYear = (last.bmi - smoothed[i].bmi) / dy;
        break;
      }
    }
  }

  return {
    series: withBmi,
    smoothed,
    rebound,
    currentBmi: current.bmi,
    currentAgeYears: current.ageYears,
    bmiTrendPerYear,
    state,
  };
}
