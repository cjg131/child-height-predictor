// combine.js - orchestrate every applicable predictor and produce a
// consensus with signal transparency.
//
// Flow:
//   1. Compute tempo signals from the full height history:
//        - heightVelocity (PHV state)
//        - bmiTrajectory   (adiposity rebound)
//        - shoeSizeSignal  (foot plateau)
//   2. Run predictors, each consuming whatever signals it can use:
//        - midParental                 (parents only, always available)
//        - siblingAdjusted             (parents + siblings, supersedes mid-parental)
//        - cdcPercentileEnhanced       (current height + velocity + Tanner)
//        - khamisRocheEnhanced         (full K-R + velocity + BMI rebound)
//        - boneAgeProjection           (when bone age is supplied)
//   3. Apply post-adjustments where the shoe-plateau signal tightens SD on
//      the trajectory-based predictors.
//   4. Inverse-variance-weighted consensus across all available predictors.
//      Because each predictor reports its own SD, tight estimators (bone age,
//      enhanced K-R when post-PHV) naturally get more weight than loose ones
//      (mid-parental).
//   5. Return per-method results, active signals, and the consensus.

import { midParentalHeight } from './midParental.js';
import { siblingAdjustedHeight } from './siblingAdjusted.js';
import { cdcPercentileProjection } from './cdcPercentile.js';
import { cdcPercentileProjectionEnhanced } from './cdcPercentileEnhanced.js';
import { khamisRoche } from './khamisRoche.js';
import { khamisRocheEnhanced } from './khamisRocheEnhanced.js';
import { boneAgeProjection } from './boneAgeProjection.js';
import { heightVelocity } from './heightVelocity.js';
import { bmiTrajectory } from './bmiTrajectory.js';
import { shoeSizeSignal } from './shoeSizeSignal.js';

/**
 * Orchestrate all predictors.
 *
 * @param {Object} params
 * @param {'male'|'female'} params.sex
 * @param {string|Date} params.birthDate
 * @param {string|Date} params.measurementDate  - most recent measurement date
 * @param {number} params.currentHeightCm
 * @param {number|null} [params.currentWeightKg]
 * @param {number|null} [params.motherHeightCm]
 * @param {number|null} [params.fatherHeightCm]
 * @param {Array<{sex:string,adultHeightCm:number}>} [params.siblings]
 * @param {number|null} [params.boneAgeYears]
 * @param {1|2|3|4|5|null} [params.tannerStage]
 * @param {Array<{measurementDate,heightCm,weightKg?,shoeSizeUs?}>} [params.heights]
 *        - full history for velocity / BMI / shoe computations
 */
export function combinePredictions(params) {
  const {
    sex,
    birthDate,
    measurementDate,
    currentHeightCm,
    currentWeightKg = null,
    motherHeightCm = null,
    fatherHeightCm = null,
    siblings = [],
    boneAgeYears = null,
    tannerStage = null,
    heights = [],
  } = params;

  // --- 1. Compute tempo signals ---
  const signals = {
    velocity: heightVelocity({ sex, birthDate, heights }),
    bmi: bmiTrajectory({ birthDate, heights }),
    shoe: shoeSizeSignal({ birthDate, heights }),
  };

  const velocityState = signals.velocity.state;
  const bmiRebound = signals.bmi.rebound;

  // --- 2. Run predictors ---
  const results = {};

  // Mid-parental (simple baseline, always shown when parents present)
  const mph = midParentalHeight({ sex, motherHeightCm, fatherHeightCm });
  if (mph) results.midParental = mph;

  // Sibling-adjusted (supersedes mid-parental when siblings present)
  const validSibs = (siblings || []).filter(
    (s) => s && (s.sex === 'male' || s.sex === 'female') && Number.isFinite(s.adultHeightCm),
  );
  const siblingAdj = siblingAdjustedHeight({
    sex, motherHeightCm, fatherHeightCm, siblings: validSibs,
  });
  if (siblingAdj && validSibs.length > 0) results.siblingAdjusted = siblingAdj;

  // CDC percentile enhanced
  if (currentHeightCm != null) {
    results.cdcPercentile = cdcPercentileProjectionEnhanced({
      sex, birthDate, measurementDate, heightCm: currentHeightCm,
      velocityState: velocityState === 'insufficient' ? null : velocityState,
      tannerStage,
    });
  }

  // Khamis-Roche enhanced
  const kr = khamisRocheEnhanced({
    sex, birthDate, measurementDate,
    currentHeightCm, currentWeightKg, motherHeightCm, fatherHeightCm,
    velocityState: velocityState === 'insufficient' ? null : velocityState,
    bmiRebound,
  });
  if (kr) results.khamisRoche = kr;

  // Bone-age projection
  const ba = boneAgeProjection({
    sex, birthDate, measurementDate,
    heightCm: currentHeightCm, boneAgeYears,
  });
  if (ba) results.boneAge = ba;

  // --- 3. Apply shoe-plateau tightening on trajectory-based predictors ---
  if (signals.shoe.state === 'plateaued') {
    if (results.cdcPercentile) {
      const newSd = Math.max(1.2, results.cdcPercentile.sdCm * 0.75);
      results.cdcPercentile = {
        ...results.cdcPercentile,
        sdCm: newSd,
        rangeLowCm: results.cdcPercentile.predictedAdultHeightCm - 2 * newSd,
        rangeHighCm: results.cdcPercentile.predictedAdultHeightCm + 2 * newSd,
        adjustments: [
          ...(results.cdcPercentile.adjustments || []),
          { signal: 'shoe-plateau', effect: 'SD tightened by 25% (foot stopped growing)' },
        ],
      };
    }
    if (results.khamisRoche) {
      const newSd = Math.max(1.2, results.khamisRoche.sdCm * 0.8);
      results.khamisRoche = {
        ...results.khamisRoche,
        sdCm: newSd,
        rangeLowCm: results.khamisRoche.predictedAdultHeightCm - 1.96 * newSd,
        rangeHighCm: results.khamisRoche.predictedAdultHeightCm + 1.96 * newSd,
        ci90LowCm: results.khamisRoche.predictedAdultHeightCm - 1.645 * newSd,
        ci90HighCm: results.khamisRoche.predictedAdultHeightCm + 1.645 * newSd,
        adjustments: [
          ...(results.khamisRoche.adjustments || []),
          { signal: 'shoe-plateau', effect: 'SD tightened by 20% (foot stopped growing)' },
        ],
      };
    }
  }

  // --- 4. Build points array for consensus ---
  // Prefer sibling-adjusted over plain mid-parental when both exist, so we
  // don't double-count the parental signal.
  const points = [];
  if (results.siblingAdjusted) {
    points.push({
      label: 'Sibling-adjusted',
      cm: results.siblingAdjusted.targetCm,
      sdCm: results.siblingAdjusted.sdCm,
      weight: null, // filled in after
    });
  } else if (results.midParental) {
    points.push({
      label: 'Mid-parental',
      cm: results.midParental.targetCm,
      sdCm: results.midParental.sdCm,
      weight: null,
    });
  }
  if (results.khamisRoche && results.khamisRoche.inAgeRange) {
    points.push({
      label: 'Khamis-Roche',
      cm: results.khamisRoche.predictedAdultHeightCm,
      sdCm: results.khamisRoche.sdCm,
      weight: null,
    });
  }
  if (results.cdcPercentile) {
    points.push({
      label: 'CDC percentile',
      cm: results.cdcPercentile.predictedAdultHeightCm,
      sdCm: results.cdcPercentile.sdCm,
      weight: null,
    });
  }
  if (results.boneAge) {
    points.push({
      label: 'Bone age',
      cm: results.boneAge.predictedAdultHeightCm,
      sdCm: results.boneAge.sdCm,
      weight: null,
    });
  }

  // --- 5. Inverse-variance consensus ---
  let consensus = null;
  if (points.length) {
    let wSum = 0;
    let wxSum = 0;
    for (const p of points) {
      const w = 1 / (p.sdCm * p.sdCm);
      wSum += w;
      wxSum += w * p.cm;
    }
    // Fill in normalized weights for UI transparency.
    for (const p of points) {
      p.weight = (1 / (p.sdCm * p.sdCm)) / wSum;
    }
    const consensusCm = wxSum / wSum;
    const consensusSdCm = Math.sqrt(1 / wSum);
    consensus = {
      predictedAdultHeightCm: consensusCm,
      sdCm: consensusSdCm,
      rangeLowCm: consensusCm - 2 * consensusSdCm,
      rangeHighCm: consensusCm + 2 * consensusSdCm,
      pointCount: points.length,
      points,
    };
  }

  // --- 6. Spread (disagreement) ---
  let spreadCm = null;
  if (points.length > 1) {
    const hs = points.map((p) => p.cm);
    spreadCm = Math.max(...hs) - Math.min(...hs);
  }

  // --- 7. Active-signal summary for UI ---
  const activeSignals = [];
  if (velocityState && velocityState !== 'insufficient') {
    activeSignals.push({
      signal: 'velocity',
      state: velocityState,
      detail: signals.velocity.lastVelocityCmPerYear
        ? `${signals.velocity.lastVelocityCmPerYear.toFixed(1)} cm/yr recent`
        : null,
    });
  }
  if (signals.bmi.rebound) {
    activeSignals.push({
      signal: 'bmi-rebound',
      state: signals.bmi.rebound.timing,
      detail: `rebound at ${signals.bmi.rebound.ageYears.toFixed(1)} yrs`,
    });
  }
  if (signals.shoe.state !== 'insufficient' && signals.shoe.state !== 'growing') {
    activeSignals.push({
      signal: 'shoe',
      state: signals.shoe.state,
      detail: `${signals.shoe.monthsStable.toFixed(0)} mo stable at US ${signals.shoe.latestShoeSize}`,
    });
  }
  if (tannerStage) {
    activeSignals.push({
      signal: 'tanner',
      state: `stage ${tannerStage}`,
      detail: null,
    });
  }
  if (boneAgeYears != null) {
    activeSignals.push({
      signal: 'bone-age',
      state: `${boneAgeYears.toFixed(1)} yrs`,
      detail: null,
    });
  }
  if (validSibs.length > 0) {
    activeSignals.push({
      signal: 'siblings',
      state: `${validSibs.length} adult sib${validSibs.length > 1 ? 's' : ''}`,
      detail: null,
    });
  }

  return {
    results,
    consensus,
    spreadCm,
    signals,
    activeSignals,
  };
}
