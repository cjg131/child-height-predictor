// Mid-parental height (Tanner) method.
//
// Formula (Tanner 1970, still the standard shortcut used in pediatric practice):
//   Boys  target height = ((father + mother) / 2) + 2.5 inches  (+ 6.5 cm)
//   Girls target height = ((father + mother) / 2) - 2.5 inches  (- 6.5 cm)
//
// Range: approximately +/- 4 inches (+/- 10 cm) covers the 95% confidence band.
// Standard deviation around the point estimate is ~2 inches (~5 cm).
//
// Strengths: simple, trivial to compute, ubiquitous in practice.
// Weaknesses: ignores the child's own trajectory. Children from short parents
// can out-hit the target and vice versa. Useful as a floor/ceiling sanity
// check rather than a precise forecast.

import { inToCm, cmToIn } from '../lib/units.js';

const MPH_OFFSET_CM = 6.5;         // 2.5 inches, converted
const MPH_RANGE_CM = 10;           // approx +/- 4 inches 95% CI
const MPH_SD_CM = 5;               // approx 2 inches (1 SD)

function meanIfDefined(a, b) {
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

/**
 * Compute the mid-parental target height for a child.
 *
 * @param {Object} params
 * @param {'male'|'female'} params.sex                 Child's sex.
 * @param {number} params.motherHeightCm               Mother's adult height in cm.
 * @param {number} params.fatherHeightCm               Father's adult height in cm.
 * @returns {{
 *   targetCm: number,            // point estimate
 *   rangeLowCm: number,          // target minus 10cm (approx 95% CI lower bound)
 *   rangeHighCm: number,         // target plus 10cm (approx 95% CI upper bound)
 *   sdCm: number,                // one standard deviation, ~5cm
 *   method: 'mid-parental',
 *   inputs: {motherHeightCm, fatherHeightCm, sex}
 * } | null}
 */
export function midParentalHeight({ sex, motherHeightCm, fatherHeightCm }) {
  const midParent = meanIfDefined(motherHeightCm, fatherHeightCm);
  if (midParent == null) return null;
  if (sex !== 'male' && sex !== 'female') {
    throw new Error(`midParentalHeight: sex must be 'male' or 'female', got ${sex}`);
  }

  const targetCm = sex === 'male'
    ? midParent + MPH_OFFSET_CM
    : midParent - MPH_OFFSET_CM;

  return {
    method: 'mid-parental',
    targetCm,
    rangeLowCm: targetCm - MPH_RANGE_CM,
    rangeHighCm: targetCm + MPH_RANGE_CM,
    sdCm: MPH_SD_CM,
    inputs: { motherHeightCm, fatherHeightCm, sex },
  };
}

/**
 * Convenience: same output as midParentalHeight but with inch values for UI.
 */
export function midParentalHeightImperial({ sex, motherHeightIn, fatherHeightIn }) {
  const result = midParentalHeight({
    sex,
    motherHeightCm: motherHeightIn == null ? null : inToCm(motherHeightIn),
    fatherHeightCm: fatherHeightIn == null ? null : inToCm(fatherHeightIn),
  });
  if (!result) return null;
  return {
    ...result,
    targetIn: cmToIn(result.targetCm),
    rangeLowIn: cmToIn(result.rangeLowCm),
    rangeHighIn: cmToIn(result.rangeHighCm),
    sdIn: cmToIn(result.sdCm),
  };
}
