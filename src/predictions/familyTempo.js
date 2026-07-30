// Family maturational tempo -- a stand-in for bone age when no radiograph exists.
//
// The problem this solves:
//   Every trajectory method here (CDC percentile-holding, and Khamis-Roche which
//   is built on it) assumes the child matures at an average rate. That
//   assumption is what bone age exists to correct. A late-maturing 13-year-old
//   is short *for now* but has extra growth runway; percentile-holding reads
//   them as simply short and under-predicts. Early maturers get the mirror-image
//   error.
//
// Without a hand radiograph we cannot observe maturational tempo. But tempo is
// substantially heritable, so parental pubertal timing is a usable PRIOR.
//
// What we ask for and why:
//   - Mother's age at menarche. This is the cleanest pubertal-timing marker in
//     humans: it is a discrete, dated event that women generally recall well,
//     and population norms are well characterised (US mean ~12.5 years).
//   - Father's maturation, as a coarse category. Men have no equivalent discrete
//     marker, so we settle for a self-reported early / average / late.
//
// How the numbers are derived:
//   Mother-daughter menarche correlation is roughly 0.4-0.5 in twin and family
//   studies, so we regress the mother's deviation toward the mean by about half.
//   Mother-to-SON transmission of pubertal timing is real but weaker and noisier,
//   so it gets a smaller coefficient. The father category is deliberately coarse
//   (+/- 0.75 years) because self-recall decades later is coarse.
//
// IMPORTANT -- this is a prior, not an observation. Two consequences enforced by
// the caller (see combine.js):
//   1. An actual bone age supersedes it entirely.
//   2. An observed Tanner stage at/after the onset of puberty down-weights it.
// And within this module: the offset is capped and carries a wide SD, so it can
// nudge a prediction but never dominate one.

import { numInRange, isSex } from './constants.js';

// US population mean age at menarche, and the spread we treat as "average".
export const MENARCHE_MEAN_YEARS = 12.5;
const MENARCHE_MIN_YEARS = 8;
const MENARCHE_MAX_YEARS = 18;

// Fraction of the mother's deviation from the mean that we expect to appear in
// the child. Same-sex transmission is the better-evidenced path.
const MOTHER_TO_DAUGHTER = 0.5;
const MOTHER_TO_SON = 0.3;

// Father's coarse self-report, in years of tempo offset (positive = late).
const FATHER_OFFSET_YEARS = { early: -0.75, average: 0, late: 0.75 };

// A soft prior must stay soft. Beyond ~1.5 years we are extrapolating well past
// what parental recall can support.
const MAX_OFFSET_YEARS = 1.5;

// Uncertainty on the offset itself. Roughly: half the residual spread of
// menarche timing that heritability does not explain.
const OFFSET_SD_ONE_PARENT = 1.0;
const OFFSET_SD_TWO_PARENTS = 0.8;

export const FATHER_MATURATION_OPTIONS = ['early', 'average', 'late'];

function fatherOffset(v) {
  if (typeof v !== 'string') return null;
  const key = v.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FATHER_OFFSET_YEARS, key)
    ? FATHER_OFFSET_YEARS[key]
    : null;
}

/**
 * Estimate the child's maturational tempo from parental pubertal timing.
 *
 * @param {Object} params
 * @param {'male'|'female'} params.sex
 * @param {number|string|null} [params.motherMenarcheAgeYears]
 * @param {'early'|'average'|'late'|null} [params.fatherMaturation]
 * @returns {{
 *   offsetYears: number,   // positive = LATE maturer (biologically behind)
 *   sdYears: number,
 *   state: 'early'|'average'|'late'|'unknown',
 *   sources: string[],
 *   inputs: Object,
 * }}
 */
export function familyTempo({ sex, motherMenarcheAgeYears, fatherMaturation }) {
  const unknown = {
    offsetYears: 0,
    sdYears: 0,
    state: 'unknown',
    sources: [],
    inputs: { sex, motherMenarcheAgeYears, fatherMaturation },
  };

  if (!isSex(sex)) return unknown;

  const contributions = [];
  const sources = [];

  const menarche = numInRange(
    motherMenarcheAgeYears, MENARCHE_MIN_YEARS, MENARCHE_MAX_YEARS,
  );
  if (menarche != null) {
    const coeff = sex === 'female' ? MOTHER_TO_DAUGHTER : MOTHER_TO_SON;
    contributions.push((menarche - MENARCHE_MEAN_YEARS) * coeff);
    sources.push('mother-menarche');
  }

  const dad = fatherOffset(fatherMaturation);
  if (dad != null) {
    contributions.push(dad);
    sources.push('father-maturation');
  }

  if (contributions.length === 0) return unknown;

  // Average the available parental signals rather than summing them -- each is
  // an independent estimate of the same underlying family tempo.
  const raw = contributions.reduce((a, b) => a + b, 0) / contributions.length;
  const offsetYears = Math.max(-MAX_OFFSET_YEARS, Math.min(MAX_OFFSET_YEARS, raw));
  const sdYears = contributions.length >= 2
    ? OFFSET_SD_TWO_PARENTS
    : OFFSET_SD_ONE_PARENT;

  // Only call it early/late once the signal clears the noise floor; otherwise
  // report 'average' so the UI does not advertise a distinction we cannot make.
  let state = 'average';
  if (offsetYears <= -0.4) state = 'early';
  else if (offsetYears >= 0.4) state = 'late';

  return {
    offsetYears,
    sdYears,
    state,
    sources,
    inputs: { sex, motherMenarcheAgeYears, fatherMaturation },
  };
}

/** Human-readable summary for the UI badge. */
export function describeTempo(tempo) {
  if (!tempo || tempo.state === 'unknown') return null;
  if (tempo.state === 'average') return 'average tempo';
  const months = Math.abs(tempo.offsetYears * 12);
  return `${Math.round(months)} mo ${tempo.state}`;
}
