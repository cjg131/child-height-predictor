// Bayley-Pinneau adult height projection.
//
// Given the child's current height and an assessed skeletal (bone) age, the
// Bayley-Pinneau method predicts adult height as:
//
//   predicted_adult = current_height / (percent_completed / 100)
//
// where percent_completed is looked up from age/sex-specific tables stratified
// by whether skeletal age is accelerated, average, or delayed relative to
// chronological age.
//
// Accuracy: in the validation studies ~2 cm (+/- 1 SD) for boys, ~1.7 cm for
// girls when skeletal age is read by a trained radiologist. Much worse for
// parent-reported or AI-estimated skeletal ages. We pass parameter-assessed
// bone ages through without judgment, but surface in the result how strong
// the underlying signal actually is.

import { BAYLEY_PINNEAU } from '../growth-data/bayley-pinneau.js';
import { ageInMonths } from '../lib/units.js';

const BONE_AGE_DIFF_THRESHOLD = 1.0;  // years

function tableForSex(sex) {
  if (sex === 'male') return BAYLEY_PINNEAU.boys;
  if (sex === 'female') return BAYLEY_PINNEAU.girls;
  throw new Error(`boneAgeProjection: unsupported sex ${sex}`);
}

/** Interpolate percent-completed in the table for a given BA and category index. */
function lookupPercent(table, boneAgeYears, categoryIdx) {
  const ages = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (boneAgeYears <= ages[0]) return table[ages[0]][categoryIdx];
  if (boneAgeYears >= ages[ages.length - 1]) return table[ages[ages.length - 1]][categoryIdx];
  // Linear interpolation between bracketing rows.
  let lo = ages[0], hi = ages[ages.length - 1];
  for (let i = 0; i < ages.length - 1; i++) {
    if (ages[i] <= boneAgeYears && boneAgeYears <= ages[i + 1]) {
      lo = ages[i]; hi = ages[i + 1]; break;
    }
  }
  const t = (boneAgeYears - lo) / (hi - lo);
  return table[lo][categoryIdx] * (1 - t) + table[hi][categoryIdx] * t;
}

function categoryFromDiff(diffYears) {
  if (diffYears >= BONE_AGE_DIFF_THRESHOLD) return { idx: 0, label: 'accelerated' };
  if (diffYears <= -BONE_AGE_DIFF_THRESHOLD) return { idx: 2, label: 'delayed' };
  return { idx: 1, label: 'average' };
}

/**
 * Predict adult height from a current measurement plus bone age.
 *
 * @param {Object} params
 * @param {'male'|'female'} params.sex
 * @param {string|Date} params.birthDate
 * @param {string|Date} params.measurementDate
 * @param {number} params.heightCm
 * @param {number} params.boneAgeYears
 * @returns {Object|null}
 */
export function boneAgeProjection({ sex, birthDate, measurementDate, heightCm, boneAgeYears }) {
  if (boneAgeYears == null || !Number.isFinite(boneAgeYears)) return null;
  if (heightCm == null || !Number.isFinite(heightCm)) return null;

  const chronoAgeYears = ageInMonths(birthDate, measurementDate) / 12;
  const diffYears = boneAgeYears - chronoAgeYears;
  const category = categoryFromDiff(diffYears);

  // Bayley-Pinneau tables start at ~6 (girls) / ~7 (boys). For younger
  // children, skeletal-age-based projection is unreliable because the
  // tables weren't built for them. Bail out and let other predictors handle
  // it.
  const minBA = sex === 'male' ? 7.0 : 6.0;
  if (boneAgeYears < minBA) return null;

  const table = tableForSex(sex);
  const pct = lookupPercent(table, boneAgeYears, category.idx);
  if (!Number.isFinite(pct) || pct <= 0) return null;

  const predictedAdultCm = heightCm / (pct / 100);

  // Precision: ~2cm SD in the original validation, but degrades when BA is
  // outside +/- 2 years of CA. Widen accordingly.
  const extremeness = Math.max(0, Math.abs(diffYears) - 1.0);
  const sdCm = 2.0 + 0.5 * extremeness;

  return {
    method: 'bone-age',
    predictedAdultHeightCm: predictedAdultCm,
    chronologicalAgeYears: chronoAgeYears,
    boneAgeYears,
    diffYears,
    category: category.label,
    percentCompleted: pct,
    sdCm,
    rangeLowCm: predictedAdultCm - 2 * sdCm,
    rangeHighCm: predictedAdultCm + 2 * sdCm,
    inputs: { sex, birthDate, measurementDate, heightCm, boneAgeYears },
  };
}
