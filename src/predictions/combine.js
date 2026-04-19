// combine.js — run all three predictors and return a single consolidated
// result for UI display.
//
// Philosophy: don't hide disagreement. Show each method's output separately
// so the user can see when they converge (confidence signal) and when they
// don't (data to investigate). We also compute a simple weighted average for
// a single headline number, weighting inversely by each method's SD.

import { midParentalHeight } from './midParental.js';
import { khamisRoche } from './khamisRoche.js';
import { cdcPercentileProjection } from './cdcPercentile.js';

/**
 * Run every applicable predictor for a single child and measurement snapshot.
 * All height/weight in metric (cm, kg). Pass null for unknown inputs and the
 * function will skip predictors that need them.
 */
export function combinePredictions({
  sex,
  birthDate,
  measurementDate,
  currentHeightCm,
  currentWeightKg = null,
  motherHeightCm = null,
  fatherHeightCm = null,
}) {
  const results = {};

  // Mid-parental needs both parents.
  const mph = midParentalHeight({ sex, motherHeightCm, fatherHeightCm });
  if (mph) results.midParental = mph;

  // Khamis-Roche needs everything.
  const kr = khamisRoche({
    sex,
    birthDate,
    measurementDate,
    currentHeightCm,
    currentWeightKg,
    motherHeightCm,
    fatherHeightCm,
  });
  if (kr) results.khamisRoche = kr;

  // CDC percentile projection only needs current height.
  if (currentHeightCm != null) {
    results.cdcPercentile = cdcPercentileProjection({
      sex,
      birthDate,
      measurementDate,
      heightCm: currentHeightCm,
    });
  }

  const points = [];
  if (results.midParental) points.push({
    label: 'Mid-parental',
    cm: results.midParental.targetCm,
    sdCm: results.midParental.sdCm,
  });
  if (results.khamisRoche && results.khamisRoche.inAgeRange) points.push({
    label: 'Khamis-Roche',
    cm: results.khamisRoche.predictedAdultHeightCm,
    sdCm: results.khamisRoche.sdCm,
  });
  if (results.cdcPercentile) points.push({
    label: 'CDC percentile',
    cm: results.cdcPercentile.predictedAdultHeightCm,
    sdCm: results.cdcPercentile.sdCm,
  });

  // Inverse-variance weighted mean. Gives tighter methods (Khamis-Roche) more
  // pull than loose ones (mid-parental).
  let consensusCm = null;
  let consensusSdCm = null;
  if (points.length) {
    let wSum = 0;
    let wxSum = 0;
    for (const p of points) {
      const w = 1 / (p.sdCm * p.sdCm);
      wSum += w;
      wxSum += w * p.cm;
    }
    consensusCm = wxSum / wSum;
    consensusSdCm = Math.sqrt(1 / wSum);
  }

  // Spread: the gap between the high and low point estimates, useful to flag
  // disagreement. If the three methods disagree by more than ~10 cm, surface
  // that to the user.
  let spreadCm = null;
  if (points.length > 1) {
    const heights = points.map((p) => p.cm);
    spreadCm = Math.max(...heights) - Math.min(...heights);
  }

  return {
    results,
    consensus: consensusCm == null ? null : {
      predictedAdultHeightCm: consensusCm,
      sdCm: consensusSdCm,
      rangeLowCm: consensusCm - 2 * consensusSdCm,
      rangeHighCm: consensusCm + 2 * consensusSdCm,
      pointCount: points.length,
    },
    spreadCm,
  };
}
