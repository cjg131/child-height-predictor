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

// How much of the tempo-implied shift we actually apply. A hand radiograph read
// by a radiologist earns 1.0; a parent's recollection of their own puberty does
// not. See the block in cdcPercentileProjectionEnhanced for the measurement that
// motivates this being well below 1.
const TEMPO_TRUST = 0.3;
const TEMPO_MAX_EXTRA_SD_CM = 3.0;

/** Shift a date by a fractional number of years, returning a Date. */
function shiftDateByYears(date, years) {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  d.setTime(d.getTime() + years * 365.25 * 24 * 60 * 60 * 1000);
  return d;
}

/**
 * Enhanced projection.
 *
 * @param {Object} params - same as cdcPercentileProjection, plus:
 * @param {'insufficient'|'pre-phv'|'at-phv'|'post-phv'} [params.velocityState]
 * @param {1|2|3|4|5|null} [params.tannerStage]
 */
export function cdcPercentileProjectionEnhanced(params) {
  const base = cdcPercentileProjection(params);
  if (base == null) return null;   // outside the CDC 2-20 table, or bad input
  const {
    velocityState, tannerStage, sex, heightCm,
    tempoOffsetYears = 0, tempoSdYears = 0,
  } = params;

  let adjustedPrediction = base.predictedAdultHeightCm;
  let adjustedSd = base.sdCm;
  const adjustments = [];

  // --- Family maturational tempo (prior, not observation) ---
  //
  // Re-running the projection against a shifted biological age is the same
  // mechanism bone age uses. But measured empirically, a one-year age shift
  // moves the adult prediction by 5-8 cm -- so applying a parental-recall prior
  // at full strength would swing the answer harder than an actual radiograph
  // does, which is indefensible. We therefore apply only TEMPO_TRUST of the
  // shift, and charge for the offset's own uncertainty by widening SD.
  if (tempoOffsetYears && Math.abs(tempoOffsetYears) > 1e-9) {
    const shifted = cdcPercentileProjection({
      ...params,
      birthDate: shiftDateByYears(params.birthDate, tempoOffsetYears),
    });
    if (shifted != null) {
      const fullShiftCm = shifted.predictedAdultHeightCm - base.predictedAdultHeightCm;
      const appliedShiftCm = fullShiftCm * TEMPO_TRUST;
      adjustedPrediction += appliedShiftCm;

      // Relative uncertainty in the offset carries straight through to the
      // shift. Self-limiting: a tiny offset yields a tiny shift, so even a large
      // relative error adds little.
      if (tempoSdYears > 0) {
        const relative = tempoSdYears / Math.abs(tempoOffsetYears);
        const extraSd = Math.min(
          TEMPO_MAX_EXTRA_SD_CM, Math.abs(appliedShiftCm) * relative,
        );
        adjustedSd = Math.sqrt(adjustedSd * adjustedSd + extraSd * extraSd);
      }

      adjustments.push({
        signal: tempoOffsetYears > 0 ? 'family-tempo-late' : 'family-tempo-early',
        effect: `Shifted ${appliedShiftCm >= 0 ? '+' : ''}${appliedShiftCm.toFixed(1)} cm `
          + `for inherited ${tempoOffsetYears > 0 ? 'late' : 'early'} maturation; SD widened`,
        offsetYears: tempoOffsetYears,
        appliedShiftCm,
      });
    }
  }

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
