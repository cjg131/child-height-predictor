// Shared constants and input validation for the prediction engine.
//
// Every predictor entry point runs its numeric inputs through the coercion
// helpers here. The reason is concrete: Firestore returns whatever type was
// written, and a parent height stored as the string '165' turned
// midParentalHeight's `(a + b) / 2` into string concatenation -- ('165' + '180')
// / 2 = 82596.5 cm. That value then flowed into the consensus unchallenged.
// Coerce first, gate on plausibility second, return null rather than guessing.

/** Tanner mid-parental sex offset. Note: the metric convention is 6.5 cm,
 *  which is NOT the same as the imperial "2.5 inches" (= 6.35 cm). We use the
 *  metric value throughout because everything is stored in cm. */
export const MPH_OFFSET_CM = 6.5;

/** One SD around the mid-parental point estimate, ~2 inches. Doubles as the
 *  floor for how certain the pooled consensus is ever allowed to claim to be
 *  when methods disagree -- see combine.js. */
export const MPH_SD_CM = 5;

// Plausibility gates. Deliberately generous -- these catch type errors and
// unit mix-ups (someone entering 68 for inches instead of 172 for cm), not
// unusual-but-real people. The tallest and shortest adults ever recorded fall
// outside these bounds; that is an acceptable trade for catching garbage.
export const MIN_ADULT_HEIGHT_CM = 120;
export const MAX_ADULT_HEIGHT_CM = 230;
export const MIN_CHILD_HEIGHT_CM = 40;
export const MAX_CHILD_HEIGHT_CM = 230;
export const MIN_WEIGHT_KG = 1;
export const MAX_WEIGHT_KG = 250;
export const MIN_BONE_AGE_YEARS = 0;
export const MAX_BONE_AGE_YEARS = 20;

/**
 * Coerce to a finite number, or null.
 * Rejects null, undefined, '', NaN, Infinity, booleans, arrays, objects.
 * Accepts numeric strings, because that is what a JSON round-trip produces.
 */
export function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Coerce and range-check in one step. Returns null if either fails.
 */
export function numInRange(v, min, max) {
  const n = num(v);
  if (n == null) return null;
  if (n < min || n > max) return null;
  return n;
}

/** An adult height that could plausibly belong to a parent or grown sibling. */
export function adultHeightCm(v) {
  return numInRange(v, MIN_ADULT_HEIGHT_CM, MAX_ADULT_HEIGHT_CM);
}

/** A height measurement for a child of any age. */
export function childHeightCm(v) {
  return numInRange(v, MIN_CHILD_HEIGHT_CM, MAX_CHILD_HEIGHT_CM);
}

/** A body weight in kilograms. */
export function weightKg(v) {
  return numInRange(v, MIN_WEIGHT_KG, MAX_WEIGHT_KG);
}

/** A skeletal age in years, as read from a hand/wrist radiograph. */
export function boneAgeYears(v) {
  return numInRange(v, MIN_BONE_AGE_YEARS, MAX_BONE_AGE_YEARS);
}

/** Tanner stage 1-5, or null. Accepts numeric strings from <select> elements. */
export function tannerStage(v) {
  const n = num(v);
  if (n == null) return null;
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

/** Normalize any date-ish value to epoch milliseconds, or null. */
export function timeOf(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/** Sex must be exactly 'male' or 'female' -- no coercion, no defaulting. */
export function isSex(v) {
  return v === 'male' || v === 'female';
}

// Normal-distribution multipliers for two-sided confidence intervals. These
// were hardcoded as bare 1.645 / 1.96 in three files; naming them makes the
// intent legible and stops a typo in one place from silently disagreeing with
// the others.
export const Z_90 = 1.645;
export const Z_95 = 1.96;
