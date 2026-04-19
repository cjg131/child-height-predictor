// Sibling-adjusted genetic target predictor.
//
// Mid-parental height treats every child of the same parents as having
// the same target. In reality, each child is a fresh genetic draw, but
// adult siblings do give us information about the family's realized
// genetic residual - i.e. the systematic offset from MPH that this
// family tends to produce.
//
// Model:
//   Each child's adult height = MPH(parents, child_sex) + R_family + e_child
//   where R_family is shared across siblings and e_child is independent.
//
// Twin and sibling studies put height heritability h^2 ~ 0.8 and full-sib
// correlation ~ 0.5. We map that to:
//   var(R_family)  ~ 0.5 * var(residual)
//   var(e_child)   ~ 0.5 * var(residual)
// with var(residual) ~ (5 cm)^2.
//
// Given N siblings with observed residuals r_1, ..., r_N, the MLE of
// R_family under this model is:
//   R_hat = mean(r_i) * [N * rho / (N * rho + (1 - rho))]
// where rho = var(R_family) / var(residual) = 0.5.
//
// Variance of R_hat shrinks with N:
//   var(R_hat) = var(R_family) * (1 - rho*N / (rho*N + (1-rho)))
//
// The predicted adult height for the target child then tightens by the
// variance explained by the family residual estimate.

import { inToCm } from '../lib/units.js';
import { midParentalHeight } from './midParental.js';

const RESIDUAL_SD_CM = 5.0;               // total residual SD around MPH
const RESIDUAL_VAR = RESIDUAL_SD_CM * RESIDUAL_SD_CM;
const RHO = 0.5;                          // sibling correlation in residuals
const SHARED_VAR = RHO * RESIDUAL_VAR;          // variance of family residual
const UNIQUE_VAR = (1 - RHO) * RESIDUAL_VAR;    // per-child noise variance
const MPH_OFFSET_CM = 6.5;

function sexOffset(sex) {
  if (sex === 'male') return MPH_OFFSET_CM;
  if (sex === 'female') return -MPH_OFFSET_CM;
  throw new Error(`sexOffset: unsupported sex ${sex}`);
}

/**
 * Predict the child's adult height from MPH plus sibling evidence.
 *
 * @param {Object} params
 * @param {'male'|'female'} params.sex
 * @param {number} params.motherHeightCm
 * @param {number} params.fatherHeightCm
 * @param {Array<{sex:'male'|'female', adultHeightCm:number}>} params.siblings
 * @returns {Object|null}
 */
export function siblingAdjustedHeight({ sex, motherHeightCm, fatherHeightCm, siblings }) {
  const mph = midParentalHeight({ sex, motherHeightCm, fatherHeightCm });
  if (!mph) return null;

  const validSibs = (siblings || []).filter(
    (s) => s && (s.sex === 'male' || s.sex === 'female') && Number.isFinite(s.adultHeightCm),
  );

  if (validSibs.length === 0) {
    return {
      method: 'sibling-adjusted',
      targetCm: mph.targetCm,
      sdCm: RESIDUAL_SD_CM,
      rangeLowCm: mph.targetCm - 2 * RESIDUAL_SD_CM,
      rangeHighCm: mph.targetCm + 2 * RESIDUAL_SD_CM,
      familyResidualCm: 0,
      siblingCount: 0,
      shrinkage: 0,
      inputs: { sex, motherHeightCm, fatherHeightCm, siblings: [] },
    };
  }

  // Each sibling's residual: observed adult height minus their own MPH.
  const midParent = (motherHeightCm + fatherHeightCm) / 2;
  const residuals = validSibs.map((s) => s.adultHeightCm - (midParent + sexOffset(s.sex)));
  const meanResidual = residuals.reduce((a, b) => a + b, 0) / residuals.length;

  const N = residuals.length;
  // Shrinkage factor toward zero when few siblings / low correlation.
  const shrinkage = (N * RHO) / (N * RHO + (1 - RHO));
  const familyResidualHat = meanResidual * shrinkage;

  // Posterior SD for the child's adult height.
  // Prior total variance = RESIDUAL_VAR (shared + unique).
  // Information about the shared component from siblings reduces it:
  //   var(R_family | data) = SHARED_VAR * (1 - shrinkage)
  // Child-specific noise is untouched.
  const posteriorSharedVar = SHARED_VAR * (1 - shrinkage);
  const posteriorTotalVar = posteriorSharedVar + UNIQUE_VAR;
  const posteriorSd = Math.sqrt(posteriorTotalVar);

  const targetCm = mph.targetCm + familyResidualHat;

  return {
    method: 'sibling-adjusted',
    targetCm,
    sdCm: posteriorSd,
    rangeLowCm: targetCm - 2 * posteriorSd,
    rangeHighCm: targetCm + 2 * posteriorSd,
    familyResidualCm: familyResidualHat,
    meanResidualCm: meanResidual,
    siblingCount: N,
    shrinkage,
    inputs: { sex, motherHeightCm, fatherHeightCm, siblings: validSibs },
  };
}

export function siblingAdjustedHeightImperial({
  sex,
  motherHeightIn,
  fatherHeightIn,
  siblings,
}) {
  const motherHeightCm = motherHeightIn == null ? null : inToCm(motherHeightIn);
  const fatherHeightCm = fatherHeightIn == null ? null : inToCm(fatherHeightIn);
  const sibsCm = (siblings || []).map((s) => ({
    sex: s.sex,
    adultHeightCm: s.adultHeightIn == null ? null : inToCm(s.adultHeightIn),
  }));
  return siblingAdjustedHeight({
    sex,
    motherHeightCm,
    fatherHeightCm,
    siblings: sibsCm,
  });
}
