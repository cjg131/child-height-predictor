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
import { cdcPercentileProjectionEnhanced } from './cdcPercentileEnhanced.js';
import { khamisRocheEnhanced } from './khamisRocheEnhanced.js';
import { boneAgeProjection } from './boneAgeProjection.js';
import { heightVelocity } from './heightVelocity.js';
import { bmiTrajectory } from './bmiTrajectory.js';
import { shoeSizeSignal } from './shoeSizeSignal.js';
import {
  tannerStage as tannerStageInput, Z_90, Z_95, MPH_SD_CM,
} from './constants.js';

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
    tannerStage: rawTannerStage = null,
    heights = [],
  } = params;

  // A <select> hands back strings ('4'), and Firestore returns whatever was
  // written. Coerce to an integer 1-5 or drop it -- a stray '4 ' or 0 must not
  // reach the Tanner percent-complete tables.
  const tannerStage = tannerStageInput(rawTannerStage);

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
    const cdc = cdcPercentileProjectionEnhanced({
      sex, birthDate, measurementDate, heightCm: currentHeightCm,
      velocityState: velocityState === 'insufficient' ? null : velocityState,
      tannerStage,
    });
    // Null under age 2 (outside the CDC stature table) -- omit rather than
    // publishing a clamped, badly wrong percentile.
    if (cdc) results.cdcPercentile = cdc;
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
        rangeLowCm: results.khamisRoche.predictedAdultHeightCm - Z_95 * newSd,
        rangeHighCm: results.khamisRoche.predictedAdultHeightCm + Z_95 * newSd,
        ci90LowCm: results.khamisRoche.predictedAdultHeightCm - Z_90 * newSd,
        ci90HighCm: results.khamisRoche.predictedAdultHeightCm + Z_90 * newSd,
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
  //
  // Khamis-Roche is internally a blend of the CDC trajectory and mid-parental
  // height (see khamisRoche.js). When K-R is in the pool the genetic signal is
  // already baked into it, so admitting mid-parental as a separate
  // "independent" observation counts the parents twice and makes the pooled SD
  // artificially tight. Sibling-adjusted carries information K-R lacks (the
  // realized family residual), so it keeps its seat -- but with its SD inflated
  // to reflect the overlap with K-R's mid-parental component.
  const krInPool = Boolean(results.khamisRoche && results.khamisRoche.inAgeRange);
  const GENETIC_OVERLAP_INFLATION = 1.4; // ~half the information is shared with K-R

  const points = [];
  if (results.siblingAdjusted) {
    points.push({
      label: 'Sibling-adjusted',
      cm: results.siblingAdjusted.targetCm,
      sdCm: results.siblingAdjusted.sdCm * (krInPool ? GENETIC_OVERLAP_INFLATION : 1),
      weight: null, // filled in after
    });
  } else if (results.midParental && !krInPool) {
    // Only admit bare mid-parental when K-R isn't already carrying it.
    points.push({
      label: 'Mid-parental',
      cm: results.midParental.targetCm,
      sdCm: results.midParental.sdCm,
      weight: null,
    });
  }
  if (krInPool) {
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

  // --- 5. Random-effects consensus ---
  //
  // Fixed-effect (pure inverse-variance) pooling assumes every predictor is an
  // unbiased draw from the same underlying truth. That assumption fails badly
  // here: when bone age says 165 cm and mid-parental says 179 cm, at least one
  // method is systematically wrong for this child, and averaging them with
  // 1/sd^2 weights produces a confidence interval that excludes every input --
  // the classic false-precision failure of naive meta-analysis.
  //
  // We use DerSimonian-Laird random effects instead. Q measures observed
  // disagreement against what the reported SDs would predict; the excess
  // becomes tau^2, a between-method variance added to every predictor before
  // re-weighting. When methods agree, tau^2 -> 0 and this reduces exactly to
  // the old inverse-variance result. When they disagree, the pooled SD widens
  // and the weights flatten (a very tight predictor stops dominating a pool it
  // visibly conflicts with).
  let consensus = null;
  if (points.length) {
    const variance = (p) => p.sdCm * p.sdCm;

    // Fixed-effect pass -- needed to compute Q.
    let wSum = 0;
    let wxSum = 0;
    let w2Sum = 0;
    for (const p of points) {
      const w = 1 / variance(p);
      wSum += w;
      wxSum += w * p.cm;
      w2Sum += w * w;
    }
    const fixedMean = wxSum / wSum;

    // Cochran's Q: weighted sum of squared deviations from the fixed-effect mean.
    let Q = 0;
    for (const p of points) {
      const d = p.cm - fixedMean;
      Q += (1 / variance(p)) * d * d;
    }

    // DerSimonian-Laird tau^2. df = k-1; the denominator is the scaling term
    // that converts excess Q into a variance on the same scale as the inputs.
    const k = points.length;
    let tau2 = 0;
    if (k > 1) {
      const denom = wSum - w2Sum / wSum;
      if (denom > 0) tau2 = Math.max(0, (Q - (k - 1)) / denom);
    }

    // Random-effects pass with tau^2 folded into every variance.
    let rwSum = 0;
    let rwxSum = 0;
    for (const p of points) {
      const rw = 1 / (variance(p) + tau2);
      rwSum += rw;
      rwxSum += rw * p.cm;
    }
    for (const p of points) {
      p.weight = (1 / (variance(p) + tau2)) / rwSum;
    }

    const consensusCm = rwxSum / rwSum;
    // Pooled SE of the mean, plus the between-method spread itself. A parent
    // wants the range the child is likely to land in, not the range the
    // *average of our methods* is likely to land in -- so tau is included.
    const rawSdCm = Math.sqrt(1 / rwSum + tau2);

    // Cap the widening. With k=3 and one outlier, DerSimonian-Laird can inflate
    // tau enough that the consensus becomes LESS certain than mid-parental
    // alone -- which is incoherent, because the parental signal is always
    // available as a floor of knowledge. Adding evidence should never leave us
    // worse off than the baseline we started from. So the pooled SD is capped
    // at the loosest contributing method, or the mid-parental SD, whichever is
    // wider. Disagreement still widens the range; it just cannot widen it past
    // "we know roughly what the parents imply and nothing more".
    const loosestSdCm = Math.max(...points.map((p) => p.sdCm));
    const sdCapCm = Math.max(loosestSdCm, MPH_SD_CM);
    const consensusSdCm = Math.min(rawSdCm, sdCapCm);
    const sdCapped = rawSdCm > sdCapCm;

    consensus = {
      predictedAdultHeightCm: consensusCm,
      sdCm: consensusSdCm,
      rangeLowCm: consensusCm - 2 * consensusSdCm,
      rangeHighCm: consensusCm + 2 * consensusSdCm,
      pointCount: points.length,
      heterogeneitySdCm: Math.sqrt(tau2),
      sdCapped,
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
  // Only advertise bone age as an active signal when it actually parsed and
  // produced a prediction -- otherwise the badge would claim a signal the
  // consensus never saw.
  if (results.boneAge) {
    activeSignals.push({
      signal: 'bone-age',
      state: `${results.boneAge.boneAgeYears.toFixed(1)} yrs`,
      detail: results.boneAge.category ? `${results.boneAge.category} maturer` : null,
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
