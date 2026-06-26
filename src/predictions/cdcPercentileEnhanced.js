// Enhanced CDC percentile projection.
//
// The base `cdcPercentileProjection` assumes a child stays on their current
// CDC stature percentile to age 20. Its weakness is tempo variation: early
// and late maturers drift off their rail during puberty.
//
// This module layers two adjustments onto the base projection:
//
// 1. Velocity / PHV state
//    - post-PHV: growth spurt is behind them. Current percentile is a much
//      more reliable predictor of adult percentile (SD ~2.5 cm).
//    - at-PHV:   in the middle of rapid growth. Percentile tracking is
//      unstable; widen SD a bit.
//    - pre-PHV:  not yet in the growth spurt. Percentile is reasonable but
//      the future spurt hasn't been sampled; slight widening.
//
// 2. Tanner stage
//    - Tanner 4-5: most growth is done. Tighten SD and apply a "percent of
//      adult height completed" correction similar to Bayley-Pinneau but
//      using clinical pubertal staging instead of bone age.
//    - Tanner 1-3 at age-appropriate windows: no adjustment beyond velocity.
//
// Tanner % of adult height achieved (clinical anchors):
//   Boys:  T1 ~80%, T2 ~83%, T3 ~88%, T4 ~95%, T5 ~99%
//   Girls: T1 ~85%, T2 ~88%, T3 ~94%, T4 ~97%, T5 ~99%
// These are approximate - pubertal maturation spans years per stage - so
// we use them only for SD tightening and a gentle correction toward the
// Tanner-implied target when Tanner >= 4.

import { cdcPercentileProjection } from './cdcPercentile.js';

const TANNER_PCT_BOYS = { 1: 80, 2: 83, 3: 88, 4: 95, 5: 99 };
const TANNER_PCT_GIRLS = { 1: 85, 2: 88, 3: 94, 4: 97, 5: 99 };

/**
 * Enhanced projection.
 *
 * @param {Object} params - same as cdcPercentileProjection, plus:
 * @param {'insufficient'|'pre-phv'|'at-phv'|'post-phv'} [params.velocityState]
 * @param {1|2|3|4|5|null} [params.tannerStage]
 */
export function cdcPercentileProjectionEnhanced(params) {
  const base = cdcPercentileProjection(params);
  const { velocityState, tannerStage, sex, heightCm } = params;

  let adjustedPrediction = base.predictedAdultHeightCm;
  let adjustedSd = base.sdCm;
  const adjustments = [];

  // --- Velocity / PHV adjustments ---
  if (velocityState === 'post-phv') {
    adjustedSd = Math.max(1.5, adjustedSd * 0.6);
    adjustments.push({ signal: 'post-phv', effect: 'SD tightened (growth spurt done)' });
  } else if (velocityState === 'at-phv') {
    adjustedSd = adjustedSd * 1.2;
    adjustments.push({ signal: 'at-phv', effect: 'SD widened (peak velocity unstable)' });
  } else if (velocityState === 'pre-phv') {
    adjustedSd = adjustedSd * 1.1;
    adjustments.push({ signal: 'pre-phv', effect: 'SD widened slightly (spurt pending)' });
  }

  // --- Tanner adjustments ---
  if (tannerStage && sex && heightCm) {
    const tanner = Number(tannerStage);
    if (tanner >= 1 && tanner <= 5) {
      const pctTable = sex === 'male' ? TANNER_PCT_BOYS : TANNER_PCT_GIRLS;
      const tannerPct = pctTable[tanner];
      if (tannerPct != null) {
        const tannerImpliedAdult = heightCm / (tannerPct / 100);
        if (tanner >= 4) {
          // Late puberty: pull prediction halfway toward Tanner-implied value
          // and tighten SD meaningfully.
          adjustedPrediction = 0.5 * adjustedPrediction + 0.5 * tannerImpliedAdult;
          adjustedSd = Math.max(1.4, adjustedSd * 0.7);
          adjustments.push({
            signal: `tanner-${tanner}`,
            effect: 'Shifted toward Tanner-implied adult height; SD tightened',
            tannerImpliedAdultCm: tannerImpliedAdult,
          });
        } else if (tanner === 3) {
          // Mid-puberty: minor pull and slight tightening.
          adjustedPrediction = 0.8 * adjustedPrediction + 0.2 * tannerImpliedAdult;
          adjustedSd = Math.max(1.8, adjustedSd * 0.85);
          adjustments.push({
            signal: 'tanner-3',
            effect: 'Minor shift toward Tanner-implied adult height',
            tannerImpliedAdultCm: tannerImpliedAdult,
          });
        } else {
          // Tanner 1-2: no shift, but log for transparency.
          adjustments.push({
            signal: `tanner-${tanner}`,
            effect: 'Recorded, no point-estimate adjustment',
            tannerImpliedAdultCm: tannerImpliedAdult,
          });
        }
      }
    }
  }

  return {
    ...base,
    method: 'cdc-percentile-enhanced',
    predictedAdultHeightCm: adjustedPrediction,
    sdCm: adjustedSd,
    rangeLowCm: adjustedPrediction - 2 * adjustedSd,
    rangeHighCm: adjustedPrediction + 2 * adjustedSd,
    adjustments,
    baseMethod: 'cdc-percentile',
    basePredictedAdultHeightCm: base.predictedAdultHeightCm,
    baseSdCm: base.sdCm,
  };
}
