// Standalone node verification of the prediction engine.
// Mirrors the vitest tests but uses plain assertions, so it runs without
// installing dependencies. Ryan can run the "real" tests with `npm test`.

import { midParentalHeight } from './src/predictions/midParental.js';
import { khamisRoche } from './src/predictions/khamisRoche.js';
import {
  cdcStatureZ,
  cdcPercentileProjection,
  cdcPercentileCurves,
  zFromLMS,
  valueFromLMS,
  normalCdf,
  zToPercentile,
} from './src/predictions/cdcPercentile.js';
import { combinePredictions } from './src/predictions/combine.js';
import { CDC_STATURE_LMS } from './src/growth-data/cdc-stature-lms.js';
import { KHAMIS_ROCHE } from './src/growth-data/khamis-roche-coefficients.js';
import { inToCm, lbToKg } from './src/lib/units.js';

let passed = 0;
let failed = 0;
const fails = [];

function eq(actual, expected, tol, label) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    passed++;
  } else {
    failed++;
    fails.push(`FAIL ${label}: got ${actual}, expected ${expected} +/- ${tol}`);
  }
}
function truthy(v, label) {
  if (v) { passed++; } else { failed++; fails.push(`FAIL ${label}: falsy (${v})`); }
}
function falsy(v, label) {
  if (!v) { passed++; } else { failed++; fails.push(`FAIL ${label}: truthy (${JSON.stringify(v)})`); }
}
function gt(a, b, label) {
  if (a > b) { passed++; } else { failed++; fails.push(`FAIL ${label}: ${a} not > ${b}`); }
}
function lt(a, b, label) {
  if (a < b) { passed++; } else { failed++; fails.push(`FAIL ${label}: ${a} not < ${b}`); }
}

// --- LMS math ---
eq(zFromLMS(50, 1, 50, 0.05), 0, 1e-10, 'z of median (L=1) is 0');
eq(zFromLMS(100, -0.5, 100, 0.08), 0, 1e-10, 'z of median (L=-0.5) is 0');
for (const { X, L, M, S } of [
  { X: 140, L: -1.5, M: 138, S: 0.045 },
  { X: 160, L: 0.2, M: 155, S: 0.038 },
  { X: 172, L: 0, M: 170, S: 0.05 },
]) {
  const z = zFromLMS(X, L, M, S);
  const back = valueFromLMS(z, L, M, S);
  eq(back, X, 1e-6, `round-trip zFromLMS/valueFromLMS (L=${L})`);
}
eq(normalCdf(0), 0.5, 1e-6, 'normalCdf(0) = 0.5');
eq(normalCdf(1.96), 0.975, 1e-4, 'normalCdf(1.96) ~ 0.975');
eq(normalCdf(-1.96), 0.025, 1e-4, 'normalCdf(-1.96) ~ 0.025');
eq(zToPercentile(0), 50, 1e-6, 'zToPercentile(0) = 50');
eq(zToPercentile(1.2816), 90, 0.02, 'zToPercentile(1.2816) ~ 90');

// --- Mid-parental ---
falsy(midParentalHeight({ sex: 'male', motherHeightCm: 165, fatherHeightCm: null }), 'mph null when father missing');
falsy(midParentalHeight({ sex: 'female', motherHeightCm: null, fatherHeightCm: 180 }), 'mph null when mother missing');
{
  const r = midParentalHeight({
    sex: 'male',
    motherHeightCm: inToCm(64),
    fatherHeightCm: inToCm(72),
  });
  const midpoint = (inToCm(64) + inToCm(72)) / 2;
  eq(r.targetCm, midpoint + 6.5, 0.01, 'mph boys adds 6.5cm');
  eq(r.rangeLowCm, r.targetCm - 10, 1e-6, 'mph boys low bound');
  eq(r.rangeHighCm, r.targetCm + 10, 1e-6, 'mph boys high bound');
  eq(r.sdCm, 5, 1e-9, 'mph sdCm = 5');
}
{
  const r = midParentalHeight({
    sex: 'female',
    motherHeightCm: inToCm(66),
    fatherHeightCm: inToCm(71),
  });
  const expected = (inToCm(66) + inToCm(71)) / 2 - 6.5;
  eq(r.targetCm, expected, 1e-6, 'mph girls subtracts 6.5cm');
}

// --- CDC stature Z ---
{
  // 50th percentile boy at age 10.
  const row = CDC_STATURE_LMS.boys.find((r) => r.ageMonths === 120.5);
  const res = cdcStatureZ({
    sex: 'male',
    birthDate: '2016-04-19',
    measurementDate: '2026-04-19',
    heightCm: row.M,
  });
  lt(Math.abs(res.z), 0.15, '50th pct boy at 10 yrs: |z| small');
  eq(res.percentile, 50, 6, '50th pct boy at 10 yrs: percentile near 50');
}

// --- CDC percentile projection ---
{
  const row = CDC_STATURE_LMS.boys.find((r) => r.ageMonths === 120.5);
  const res = cdcPercentileProjection({
    sex: 'male',
    birthDate: '2016-04-19',
    measurementDate: '2026-04-19',
    heightCm: row.M,
  });
  // CDC boys 50th pct at 20 years = ~176.8 cm.
  gt(res.predictedAdultHeightCm, 174, 'projection 50th boy > 174cm');
  lt(res.predictedAdultHeightCm, 179, 'projection 50th boy < 179cm');
}
{
  // 90th percentile girl at 12.
  const row = CDC_STATURE_LMS.girls.find((r) => r.ageMonths === 144.5);
  const z = 1.2816;
  const X = valueFromLMS(z, row.L, row.M, row.S);
  const res = cdcPercentileProjection({
    sex: 'female',
    birthDate: '2014-04-19',
    measurementDate: '2026-04-19',
    heightCm: X,
  });
  gt(res.predictedAdultHeightCm, 167, 'projection 90th girl > 167cm');
  lt(res.predictedAdultHeightCm, 175, 'projection 90th girl < 175cm');
}

// --- CDC percentile curves monotonic ---
{
  const curves = cdcPercentileCurves('male');
  let ok = true;
  for (const r of curves) {
    if (!(r.p3 < r.p10 && r.p10 < r.p25 && r.p25 < r.p50 && r.p50 < r.p75 && r.p75 < r.p90 && r.p90 < r.p97)) {
      ok = false; break;
    }
  }
  truthy(ok, 'boys percentile curves are monotonic');
}
{
  const curves = cdcPercentileCurves('female', { startMonths: 24, endMonths: 240, stepMonths: 12 });
  gt(curves[0].p50, 80, 'girls p50 at 2 yrs > 80cm');
  lt(curves[0].p50, 90, 'girls p50 at 2 yrs < 90cm');
  gt(curves[curves.length - 1].p50, 160, 'girls p50 at 20 yrs > 160cm');
  lt(curves[curves.length - 1].p50, 166, 'girls p50 at 20 yrs < 166cm');
}

// --- Khamis-Roche ---
{
  const base = {
    sex: 'male',
    birthDate: '2014-02-27',
    measurementDate: '2026-04-19',
    currentHeightCm: 150,
    currentWeightKg: 40,
    motherHeightCm: 165,
    fatherHeightCm: 180,
  };
  falsy(khamisRoche({ ...base, motherHeightCm: null }), 'KR null when mother missing');
  falsy(khamisRoche({ ...base, currentWeightKg: null }), 'KR null when weight missing');
  const res = khamisRoche(base);
  truthy(res.inAgeRange, 'KR 12yo in range');
  gt(res.predictedAdultHeightCm, 165, 'KR plausible lower');
  lt(res.predictedAdultHeightCm, 195, 'KR plausible upper');
  eq(res.sdCm, 5.6 / 1.645, 1e-4, 'KR boys sdCm matches published');
}
{
  const res = khamisRoche({
    sex: 'male',
    birthDate: '2024-01-01',
    measurementDate: '2026-04-19',
    currentHeightCm: 88,
    currentWeightKg: 12,
    motherHeightCm: 165,
    fatherHeightCm: 180,
  });
  falsy(res.inAgeRange, 'KR under 4yo flagged out of range');
  truthy(res.outOfRangeReason && res.outOfRangeReason.includes('below'), 'KR out-of-range reason mentions below');
}
{
  // Taller parents → taller child, holding other inputs constant.
  const base = {
    sex: 'female',
    birthDate: '2016-04-19',
    measurementDate: '2026-04-19',
    currentHeightCm: 140,
    currentWeightKg: 35,
  };
  const a = khamisRoche({ ...base, motherHeightCm: 160, fatherHeightCm: 175 });
  const b = khamisRoche({ ...base, motherHeightCm: 170, fatherHeightCm: 188 });
  gt(b.predictedAdultHeightCm, a.predictedAdultHeightCm, 'KR taller parents -> taller child');
}

// --- combinePredictions ---
{
  const child = {
    sex: 'male',
    birthDate: '2014-02-27',
    measurementDate: '2026-04-19',
    currentHeightCm: inToCm(59),
    currentWeightKg: lbToKg(90),
    motherHeightCm: inToCm(65),
    fatherHeightCm: inToCm(72),
  };
  const { results, consensus, spreadCm } = combinePredictions(child);
  truthy(results.midParental, 'combine: mph present');
  truthy(results.khamisRoche, 'combine: KR present');
  truthy(results.cdcPercentile, 'combine: CDC present');
  truthy(consensus && consensus.predictedAdultHeightCm, 'combine: consensus present');
  truthy(spreadCm >= 0, 'combine: spread non-negative');

  const partial = combinePredictions({ ...child, motherHeightCm: null, fatherHeightCm: null });
  falsy(partial.results.midParental, 'combine: mph skipped when parents null');
  falsy(partial.results.khamisRoche, 'combine: KR skipped when parents null');
  truthy(partial.results.cdcPercentile, 'combine: CDC still runs');
  truthy(partial.consensus.sdCm >= consensus.sdCm, 'combine: partial consensus sd >= full');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of fails) console.log(f);
  process.exit(1);
}
