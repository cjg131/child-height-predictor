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

// --- heightVelocity ---
import { heightVelocity } from './src/predictions/heightVelocity.js';
{
  const r = heightVelocity({
    sex: 'male',
    birthDate: '2014-02-27',
    heights: [{ measurementDate: '2026-01-01', heightCm: 150 }],
  });
  truthy(r.state === 'insufficient', 'velocity: insufficient with 1 point');
}
{
  const r = heightVelocity({
    sex: 'male',
    birthDate: '2014-02-27',
    heights: [
      { measurementDate: '2025-01-01', heightCm: 145 },
      { measurementDate: '2026-01-01', heightCm: 151 },
    ],
  });
  truthy(r.velocities.length === 1, 'velocity: one interval computed');
  eq(r.velocities[0].cmPerYear, 6, 0.1, 'velocity: 6 cm/yr');
}
{
  const r = heightVelocity({
    sex: 'male',
    birthDate: '2010-01-01',
    heights: [
      { measurementDate: '2022-01-01', heightCm: 142 },
      { measurementDate: '2023-01-01', heightCm: 148 },
      { measurementDate: '2024-01-01', heightCm: 157.5 },
      { measurementDate: '2025-01-01', heightCm: 163.5 },
      { measurementDate: '2026-01-01', heightCm: 165.5 },
    ],
  });
  truthy(r.peak !== null, 'velocity: peak detected');
  truthy(r.peak.cmPerYear > 7, 'velocity: peak > 7 cm/yr');
  truthy(r.state === 'post-phv', 'velocity: post-PHV state');
  truthy(r.monthsSincePhv > 0, 'velocity: months since PHV positive');
}
{
  const r = heightVelocity({
    sex: 'male',
    birthDate: '2016-01-01',
    heights: [
      { measurementDate: '2025-01-01', heightCm: 135 },
      { measurementDate: '2026-01-01', heightCm: 140 },
    ],
  });
  truthy(r.state === 'pre-phv', 'velocity: pre-PHV for 10yo');
}
{
  const r = heightVelocity({
    sex: 'male',
    birthDate: '2014-02-27',
    heights: [
      { measurementDate: '2026-01-01', heightCm: 150 },
      { measurementDate: '2026-02-01', heightCm: 151 },
    ],
  });
  truthy(r.state === 'insufficient', 'velocity: short interval skipped');
}


// ---- BMI trajectory / adiposity rebound ----
import { bmiTrajectory } from './src/predictions/bmiTrajectory.js';
{
  const r = bmiTrajectory({ birthDate: '2020-01-01', heights: [] });
  truthy(r.state === 'insufficient', 'bmi: insufficient when empty');
}
{
  const r = bmiTrajectory({
    birthDate: '2020-01-01',
    heights: [
      { measurementDate: '2023-01-01', heightCm: 95, weightKg: 14 },
      { measurementDate: '2024-01-01', heightCm: 103, weightKg: 16 },
    ],
  });
  truthy(r.state === 'insufficient', 'bmi: insufficient with 2 paired measurements');
  truthy(r.currentBmi > 14 && r.currentBmi < 16, 'bmi: current bmi computed');
}
{
  // Classic trajectory: BMI dips at ~5, climbs after
  const r = bmiTrajectory({
    birthDate: '2015-06-01',
    heights: [
      { measurementDate: '2018-06-01', heightCm: 95,  weightKg: 14.3 },
      { measurementDate: '2019-06-01', heightCm: 104, weightKg: 16.2 },
      { measurementDate: '2020-06-01', heightCm: 110, weightKg: 17.5 },
      { measurementDate: '2021-06-01', heightCm: 117, weightKg: 20.0 },
      { measurementDate: '2022-06-01', heightCm: 123, weightKg: 23.5 },
      { measurementDate: '2023-06-01', heightCm: 129, weightKg: 27.0 },
    ],
  });
  truthy(r.state === 'rebound-detected', 'bmi: rebound detected classic');
  truthy(r.rebound != null, 'bmi: rebound object returned');
  truthy(r.rebound.ageYears >= 4.5 && r.rebound.ageYears <= 7.0, 'bmi: rebound age in expected window');
  truthy(['early', 'normal'].includes(r.rebound.timing), 'bmi: rebound timing classified');
  truthy(r.bmiTrendPerYear > 0, 'bmi: positive trend after rebound');
}
{
  // Early rebound before age 5
  const r = bmiTrajectory({
    birthDate: '2017-01-01',
    heights: [
      { measurementDate: '2019-01-01', heightCm: 85,  weightKg: 12.5 },
      { measurementDate: '2020-01-01', heightCm: 92,  weightKg: 13.4 },
      { measurementDate: '2021-01-01', heightCm: 100, weightKg: 14.8 },
      { measurementDate: '2022-01-01', heightCm: 107, weightKg: 17.8 },
      { measurementDate: '2023-01-01', heightCm: 113, weightKg: 21.2 },
      { measurementDate: '2024-01-01', heightCm: 119, weightKg: 25.0 },
    ],
  });
  truthy(r.state === 'rebound-detected', 'bmi: early rebound detected');
  truthy(r.rebound.timing === 'early', 'bmi: early rebound classified early');
  truthy(r.rebound.ageYears < 5, 'bmi: early rebound age < 5');
}
{
  // Still declining, no confirmed turnaround
  const r = bmiTrajectory({
    birthDate: '2020-01-01',
    heights: [
      { measurementDate: '2023-01-01', heightCm: 95,  weightKg: 15.0 },
      { measurementDate: '2024-01-01', heightCm: 103, weightKg: 16.3 },
      { measurementDate: '2025-01-01', heightCm: 110, weightKg: 17.5 },
    ],
  });
  truthy(r.state === 'pre-rebound', 'bmi: pre-rebound when still declining');
  truthy(r.rebound === null, 'bmi: no rebound object yet');
}
{
  // Missing weight on some measurements - still works on paired ones
  const r = bmiTrajectory({
    birthDate: '2015-06-01',
    heights: [
      { measurementDate: '2018-06-01', heightCm: 95,  weightKg: 14.3 },
      { measurementDate: '2019-06-01', heightCm: 104, weightKg: null },
      { measurementDate: '2020-06-01', heightCm: 110, weightKg: 17.5 },
      { measurementDate: '2021-06-01', heightCm: 117, weightKg: 20.0 },
      { measurementDate: '2022-06-01', heightCm: 123, weightKg: 23.5 },
    ],
  });
  truthy(r.series.length === 4, 'bmi: unpaired measurements skipped');
  truthy(r.state !== 'insufficient', 'bmi: still works with 4 paired points');
}


// ---- Sibling-adjusted genetic target ----
import { siblingAdjustedHeight } from './src/predictions/siblingAdjusted.js';
{
  const r = siblingAdjustedHeight({
    sex: 'male',
    motherHeightCm: 165,
    fatherHeightCm: 180,
    siblings: [],
  });
  truthy(r != null, 'sib: returns result with no siblings');
  truthy(Math.abs(r.targetCm - 179) < 0.01, 'sib: no siblings, target equals MPH');
  truthy(r.shrinkage === 0, 'sib: shrinkage zero with no sibs');
  truthy(Math.abs(r.sdCm - 5) < 0.01, 'sib: SD equals prior with no sibs');
}
{
  // Male child, one adult male sibling 5cm above his MPH -> family residual +5
  // With 1 sib, shrinkage = 1*0.5 / (0.5 + 0.5) = 0.5, so target shifts by 2.5
  const r = siblingAdjustedHeight({
    sex: 'male',
    motherHeightCm: 165,
    fatherHeightCm: 180,
    siblings: [{ sex: 'male', adultHeightCm: 184 }],  // MPH_male = 179, +5 residual
  });
  truthy(Math.abs(r.meanResidualCm - 5) < 0.01, 'sib: mean residual computed');
  truthy(Math.abs(r.shrinkage - 0.5) < 0.001, 'sib: shrinkage 0.5 with 1 sib');
  truthy(Math.abs(r.familyResidualCm - 2.5) < 0.01, 'sib: family residual shrunk to 2.5');
  truthy(Math.abs(r.targetCm - 181.5) < 0.01, 'sib: target lifted by 2.5cm');
  truthy(r.sdCm < 5, 'sib: SD tighter than prior');
  truthy(r.sdCm > 3.5, 'sib: SD still meaningful');
}
{
  // Female child, two adult female sibs, both 3cm below their MPH
  // MPH_female = (165+180)/2 - 6.5 = 166
  // siblings at 163 each -> residual = -3 each, mean = -3
  // shrinkage = 2*0.5 / (1 + 0.5) = 2/3
  // family residual = -3 * 2/3 = -2
  const r = siblingAdjustedHeight({
    sex: 'female',
    motherHeightCm: 165,
    fatherHeightCm: 180,
    siblings: [
      { sex: 'female', adultHeightCm: 163 },
      { sex: 'female', adultHeightCm: 163 },
    ],
  });
  truthy(Math.abs(r.meanResidualCm - (-3)) < 0.01, 'sib: mean residual negative');
  truthy(Math.abs(r.shrinkage - (2/3)) < 0.001, 'sib: shrinkage 2/3 with 2 sibs');
  truthy(Math.abs(r.familyResidualCm - (-2)) < 0.01, 'sib: family residual -2');
  truthy(Math.abs(r.targetCm - 164) < 0.01, 'sib: female target dropped to 164');
}
{
  // Mixed-sex siblings - each gets own sex adjustment
  // MPH for male child = 179
  // Male sib at 184 (residual +5), Female sib at 170 (residual +4 from 166)
  // Mean residual = 4.5, shrinkage 2/3, family residual = 3.0
  const r = siblingAdjustedHeight({
    sex: 'male',
    motherHeightCm: 165,
    fatherHeightCm: 180,
    siblings: [
      { sex: 'male', adultHeightCm: 184 },
      { sex: 'female', adultHeightCm: 170 },
    ],
  });
  truthy(Math.abs(r.meanResidualCm - 4.5) < 0.01, 'sib: mixed-sex mean residual');
  truthy(Math.abs(r.targetCm - 182) < 0.01, 'sib: mixed-sex target');
}
{
  // Null parents -> null result
  const r = siblingAdjustedHeight({
    sex: 'male',
    motherHeightCm: null,
    fatherHeightCm: 180,
    siblings: [],
  });
  truthy(r === null, 'sib: returns null without parent heights');
}
{
  // Bad sibling entries are filtered
  const r = siblingAdjustedHeight({
    sex: 'male',
    motherHeightCm: 165,
    fatherHeightCm: 180,
    siblings: [
      { sex: 'male', adultHeightCm: 184 },
      { sex: null, adultHeightCm: 180 },           // skipped
      { sex: 'male', adultHeightCm: null },        // skipped
    ],
  });
  truthy(r.siblingCount === 1, 'sib: bad sibs filtered');
}

// ---- Bayley-Pinneau bone-age projection ----
import { boneAgeProjection } from './src/predictions/boneAgeProjection.js';
{
  // 10yo boy, BA=10 (average), height 140cm. Table says 82.1% -> 170.5cm
  const r = boneAgeProjection({
    sex: 'male',
    birthDate: '2016-01-01',
    measurementDate: '2026-01-01',
    heightCm: 140,
    boneAgeYears: 10.0,
  });
  truthy(r != null, 'bone: returns result');
  truthy(r.category === 'average', 'bone: category average when BA=CA');
  truthy(Math.abs(r.percentCompleted - 82.1) < 0.01, 'bone: table lookup correct');
  truthy(Math.abs(r.predictedAdultHeightCm - 170.5) < 0.5, 'bone: predicted adult ~170.5');
}
{
  // Same boy, BA=11.5 (accelerated by 1.5yr), height 140cm -> 89.4% -> ~156.6cm predicted
  // accelerated means higher % completed -> shorter predicted adult height
  const r = boneAgeProjection({
    sex: 'male',
    birthDate: '2016-01-01',
    measurementDate: '2026-01-01',
    heightCm: 140,
    boneAgeYears: 11.5,
  });
  truthy(r.category === 'accelerated', 'bone: accelerated label');
  truthy(r.predictedAdultHeightCm < 160, 'bone: accelerated kid predicted shorter');
  truthy(r.sdCm > 2, 'bone: SD widens when BA diverges');
}
{
  // Same boy, BA=8.5 (delayed by 1.5yr), height 140cm -> 73.4% -> ~190cm predicted
  const r = boneAgeProjection({
    sex: 'male',
    birthDate: '2016-01-01',
    measurementDate: '2026-01-01',
    heightCm: 140,
    boneAgeYears: 8.5,
  });
  truthy(r.category === 'delayed', 'bone: delayed label');
  truthy(r.predictedAdultHeightCm > 185, 'bone: delayed kid predicted taller');
}
{
  // 12yo girl, BA=12 average, height 150cm -> 94.5% -> ~158.7cm
  const r = boneAgeProjection({
    sex: 'female',
    birthDate: '2014-01-01',
    measurementDate: '2026-01-01',
    heightCm: 150,
    boneAgeYears: 12.0,
  });
  truthy(r.category === 'average', 'bone: girl average');
  truthy(Math.abs(r.predictedAdultHeightCm - 158.7) < 0.5, 'bone: girl predicted ~158.7');
}
{
  // Interpolated BA between table rows (BA=10.25 for boy avg)
  // table: 10.0=82.1, 10.5=84.0 -> 10.25=83.05
  const r = boneAgeProjection({
    sex: 'male',
    birthDate: '2016-01-01',
    measurementDate: '2026-04-01',  // ~10.25yo so BA==CA is average
    heightCm: 140,
    boneAgeYears: 10.25,
  });
  truthy(Math.abs(r.percentCompleted - 83.05) < 0.05, 'bone: interpolation at 10.25');
}
{
  // No bone age provided -> null
  const r = boneAgeProjection({
    sex: 'male',
    birthDate: '2016-01-01',
    measurementDate: '2026-01-01',
    heightCm: 140,
    boneAgeYears: null,
  });
  truthy(r === null, 'bone: null when no BA');
}
{
  // BA below table minimum -> null
  const r = boneAgeProjection({
    sex: 'male',
    birthDate: '2022-01-01',
    measurementDate: '2026-01-01',
    heightCm: 100,
    boneAgeYears: 5.0,
  });
  truthy(r === null, 'bone: null when BA too young for table');
}

// ---- Enhanced CDC percentile projection ----
import { cdcPercentileProjectionEnhanced } from './src/predictions/cdcPercentileEnhanced.js';
{
  // Baseline: no velocity state, no Tanner -> matches base prediction
  const r = cdcPercentileProjectionEnhanced({
    sex: 'male',
    birthDate: '2014-02-27',
    measurementDate: '2026-02-27',
    heightCm: 150,
  });
  truthy(r.method === 'cdc-percentile-enhanced', 'cdc-enh: method tag');
  truthy(r.adjustments.length === 0, 'cdc-enh: no adjustments without signals');
  truthy(Math.abs(r.predictedAdultHeightCm - r.basePredictedAdultHeightCm) < 0.01, 'cdc-enh: unchanged estimate');
}
{
  // post-PHV tightens SD
  const r = cdcPercentileProjectionEnhanced({
    sex: 'male',
    birthDate: '2012-01-01',
    measurementDate: '2026-01-01',
    heightCm: 170,
    velocityState: 'post-phv',
  });
  truthy(r.sdCm < r.baseSdCm, 'cdc-enh: post-PHV tightens SD');
  truthy(r.adjustments.some((a) => a.signal === 'post-phv'), 'cdc-enh: post-PHV in adjustments');
}
{
  // at-PHV widens SD
  const r = cdcPercentileProjectionEnhanced({
    sex: 'male',
    birthDate: '2013-01-01',
    measurementDate: '2026-01-01',
    heightCm: 160,
    velocityState: 'at-phv',
  });
  truthy(r.sdCm > r.baseSdCm, 'cdc-enh: at-PHV widens SD');
}
{
  // Tanner 5 at age 15 boy, height 175 -> implied 99% -> 176.8
  // Pull prediction halfway from base toward 176.8
  const r = cdcPercentileProjectionEnhanced({
    sex: 'male',
    birthDate: '2011-01-01',
    measurementDate: '2026-01-01',
    heightCm: 175,
    tannerStage: 5,
  });
  truthy(r.adjustments.some((a) => a.signal === 'tanner-5'), 'cdc-enh: tanner-5 adjustment');
  truthy(r.sdCm < r.baseSdCm, 'cdc-enh: tanner 5 tightens SD');
  // Predicted should be between base and ~176.8
  const tannerImplied = 175 / 0.99;
  const minEnd = Math.min(r.basePredictedAdultHeightCm, tannerImplied);
  const maxEnd = Math.max(r.basePredictedAdultHeightCm, tannerImplied);
  truthy(r.predictedAdultHeightCm >= minEnd - 0.01 && r.predictedAdultHeightCm <= maxEnd + 0.01,
         'cdc-enh: tanner-adjusted in between');
}
{
  // Tanner 2 boy, no point-estimate change but signal recorded
  const r = cdcPercentileProjectionEnhanced({
    sex: 'male',
    birthDate: '2014-01-01',
    measurementDate: '2026-01-01',
    heightCm: 150,
    tannerStage: 2,
  });
  truthy(r.adjustments.some((a) => a.signal === 'tanner-2'), 'cdc-enh: tanner-2 recorded');
  truthy(Math.abs(r.predictedAdultHeightCm - r.basePredictedAdultHeightCm) < 0.01,
         'cdc-enh: tanner-2 no point shift');
}
{
  // Girl tanner 4 post-PHV combined
  const r = cdcPercentileProjectionEnhanced({
    sex: 'female',
    birthDate: '2012-01-01',
    measurementDate: '2026-01-01',
    heightCm: 160,
    tannerStage: 4,
    velocityState: 'post-phv',
  });
  truthy(r.adjustments.length >= 2, 'cdc-enh: combined signals');
  truthy(r.sdCm < r.baseSdCm * 0.8, 'cdc-enh: stacked tightening');
}

// ---- Enhanced Khamis-Roche ----
import { khamisRocheEnhanced } from './src/predictions/khamisRocheEnhanced.js';
{
  // Baseline equivalence: no signals -> same point estimate as base K-R.
  const r = khamisRocheEnhanced({
    sex: 'male',
    birthDate: '2014-02-27',
    measurementDate: '2026-02-27',
    currentHeightCm: 150,
    currentWeightKg: 40,
    motherHeightCm: 165,
    fatherHeightCm: 180,
  });
  truthy(Math.abs(r.predictedAdultHeightCm - r.basePredictedAdultHeightCm) < 0.01,
         'kr-enh: same point estimate with no signals');
  truthy(r.adjustments.length === 0, 'kr-enh: no adjustments with no signals');
}
{
  // post-PHV tightens SD
  const r = khamisRocheEnhanced({
    sex: 'male',
    birthDate: '2011-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 175,
    currentWeightKg: 65,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    velocityState: 'post-phv',
  });
  truthy(r.sdCm < r.baseSdCm, 'kr-enh: post-PHV tightens SD');
}
{
  // Early BMI rebound lowers point estimate by 1.5cm
  const r = khamisRocheEnhanced({
    sex: 'male',
    birthDate: '2018-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 130,
    currentWeightKg: 30,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    bmiRebound: { timing: 'early', ageYears: 4.5 },
  });
  truthy(Math.abs(r.predictedAdultHeightCm - (r.basePredictedAdultHeightCm - 1.5)) < 0.01,
         'kr-enh: early rebound -1.5 cm');
}
{
  // Late BMI rebound raises point estimate by 1.5cm
  const r = khamisRocheEnhanced({
    sex: 'male',
    birthDate: '2018-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 130,
    currentWeightKg: 30,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    bmiRebound: { timing: 'late', ageYears: 7.5 },
  });
  truthy(Math.abs(r.predictedAdultHeightCm - (r.basePredictedAdultHeightCm + 1.5)) < 0.01,
         'kr-enh: late rebound +1.5 cm');
}
{
  // Post-PHV suppresses the rebound adjustment (it's already in the data)
  const r = khamisRocheEnhanced({
    sex: 'male',
    birthDate: '2011-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 175,
    currentWeightKg: 65,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    velocityState: 'post-phv',
    bmiRebound: { timing: 'early', ageYears: 4.5 },
  });
  // Point estimate should NOT be shifted by rebound when post-PHV
  truthy(Math.abs(r.predictedAdultHeightCm - r.basePredictedAdultHeightCm) < 0.01,
         'kr-enh: post-PHV skips rebound shift');
}

// ---- Shoe-size plateau signal ----
import { shoeSizeSignal } from './src/predictions/shoeSizeSignal.js';
{
  const r = shoeSizeSignal({ birthDate: '2010-01-01', heights: [] });
  truthy(r.state === 'insufficient', 'shoe: empty -> insufficient');
}
{
  const r = shoeSizeSignal({
    birthDate: '2010-01-01',
    heights: [{ measurementDate: '2024-01-01', shoeSizeUs: 10 }],
  });
  truthy(r.state === 'insufficient', 'shoe: 1 obs -> insufficient');
  truthy(r.latestShoeSize === 10, 'shoe: latest returned even for insufficient');
}
{
  // 14 months stable at size 10
  const r = shoeSizeSignal({
    birthDate: '2010-01-01',
    heights: [
      { measurementDate: '2024-10-01', shoeSizeUs: 10 },
      { measurementDate: '2025-04-01', shoeSizeUs: 10 },
      { measurementDate: '2025-12-01', shoeSizeUs: 10 },
    ],
  });
  truthy(r.state === 'plateaued', 'shoe: 14mo stable -> plateaued');
  truthy(r.monthsStable > 12, 'shoe: monthsStable > 12');
}
{
  // Growing: gained 2 sizes across 12 months
  const r = shoeSizeSignal({
    birthDate: '2012-01-01',
    heights: [
      { measurementDate: '2025-01-01', shoeSizeUs: 7 },
      { measurementDate: '2025-07-01', shoeSizeUs: 8 },
      { measurementDate: '2026-01-01', shoeSizeUs: 9 },
    ],
  });
  truthy(r.state === 'growing', 'shoe: active growth');
  truthy(r.recentGain >= 1.5, 'shoe: gain recorded');
}
{
  // Slowing: gained 0.5 across 10 months, not yet 12 stable
  const r = shoeSizeSignal({
    birthDate: '2010-01-01',
    heights: [
      { measurementDate: '2025-02-01', shoeSizeUs: 9.5 },
      { measurementDate: '2025-08-01', shoeSizeUs: 10 },
      { measurementDate: '2025-12-01', shoeSizeUs: 10 },
    ],
  });
  truthy(r.state === 'slowing', 'shoe: slowing growth');
}

// ---- Integrated combinePredictions with all signals ----
{
  // Minimal: just current height, no parents, no history -> CDC only
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2016-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 140,
  });
  truthy(out.results.cdcPercentile != null, 'combine: CDC alone works');
  truthy(out.consensus != null, 'combine: consensus with 1 point');
  truthy(out.consensus.points.length === 1, 'combine: 1 point in consensus');
  truthy(Math.abs(out.consensus.points[0].weight - 1.0) < 1e-6, 'combine: single weight = 1.0');
  truthy(out.activeSignals.length === 0, 'combine: no active signals');
}
{
  // Full inputs, parents only - classic 4-method ensemble
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2014-02-27',
    measurementDate: '2026-02-27',
    currentHeightCm: 150,
    currentWeightKg: 40,
    motherHeightCm: 165,
    fatherHeightCm: 180,
  });
  truthy(out.results.midParental != null, 'combine: MPH present');
  truthy(out.results.khamisRoche != null, 'combine: K-R present');
  truthy(out.results.cdcPercentile != null, 'combine: CDC present');
  truthy(out.results.boneAge == null, 'combine: no bone age');
  truthy(out.consensus.points.length === 3, 'combine: 3 methods contributing');
  truthy(out.spreadCm != null, 'combine: spread reported');
}
{
  // Siblings supersede mid-parental in consensus
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2014-02-27',
    measurementDate: '2026-02-27',
    currentHeightCm: 150,
    currentWeightKg: 40,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    siblings: [{ sex: 'male', adultHeightCm: 185 }],
  });
  truthy(out.results.siblingAdjusted != null, 'combine: sibling predictor active');
  const labels = out.consensus.points.map((p) => p.label);
  truthy(labels.includes('Sibling-adjusted'), 'combine: sibling-adjusted in consensus');
  truthy(!labels.includes('Mid-parental'), 'combine: mid-parental excluded when siblings');
  truthy(out.activeSignals.some((s) => s.signal === 'siblings'), 'combine: sibling signal active');
}
{
  // Full history with measurements spanning puberty -> velocity signal present
  const heights = [];
  // Build height history: boy 11yr old now, growing
  const birth = new Date('2015-01-01');
  for (let m = 108; m <= 132; m += 6) {
    const date = new Date(birth);
    date.setMonth(date.getMonth() + m);
    heights.push({
      measurementDate: date.toISOString().slice(0, 10),
      heightCm: 135 + (m - 108) * 0.6,  // ~7cm/yr
      weightKg: 35 + (m - 108) * 0.25,
    });
  }
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2015-01-01',
    measurementDate: heights[heights.length - 1].measurementDate,
    currentHeightCm: heights[heights.length - 1].heightCm,
    currentWeightKg: heights[heights.length - 1].weightKg,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    heights,
  });
  truthy(out.signals.velocity.state !== 'insufficient', 'combine: velocity computed');
  truthy(out.activeSignals.some((s) => s.signal === 'velocity'), 'combine: velocity in active signals');
}
{
  // Bone age supplied -> bone-age predictor contributes and often dominates
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2014-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 150,
    currentWeightKg: 40,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    boneAgeYears: 12.0,
    tannerStage: 3,
  });
  truthy(out.results.boneAge != null, 'combine: bone age predictor active');
  const baPoint = out.consensus.points.find((p) => p.label === 'Bone age');
  truthy(baPoint != null, 'combine: bone age in consensus');
  truthy(baPoint.weight > 0.3, 'combine: bone age gets heavy weight (tight SD)');
  truthy(out.activeSignals.some((s) => s.signal === 'bone-age'), 'combine: BA signal active');
  truthy(out.activeSignals.some((s) => s.signal === 'tanner'), 'combine: tanner signal active');
}
{
  // Plateaued shoe size tightens trajectory predictors SD
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2010-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 175,
    currentWeightKg: 65,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    heights: [
      { measurementDate: '2024-10-01', heightCm: 173, weightKg: 62, shoeSizeUs: 10 },
      { measurementDate: '2025-04-01', heightCm: 174, weightKg: 63, shoeSizeUs: 10 },
      { measurementDate: '2026-01-01', heightCm: 175, weightKg: 65, shoeSizeUs: 10 },
    ],
  });
  truthy(out.signals.shoe.state === 'plateaued', 'combine: shoe plateau detected');
  const krAdjs = out.results.khamisRoche.adjustments.map((a) => a.signal);
  truthy(krAdjs.includes('shoe-plateau'), 'combine: shoe-plateau adjustment on K-R');
  truthy(out.activeSignals.some((s) => s.signal === 'shoe'), 'combine: shoe signal active');
}
{
  // No inputs at all -> empty everything, no crash
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2018-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: null,
  });
  truthy(out.consensus === null, 'combine: null consensus with no inputs');
  truthy(Object.keys(out.results).length === 0, 'combine: no predictors run');
}

// ---- Full-stack integration: kid with every signal populated ----
{
  // 14yo boy. Parents 165/180. One adult brother 184 cm.
  // Height history 11-14 showing PHV around 12.5-13.
  // Tanner 4 at last visit, bone age 14.5, shoe size stable at 10 for 14 months.
  const heights = [
    { measurementDate: '2023-01-01', heightCm: 145, weightKg: 39, shoeSizeUs: 8.5 },
    { measurementDate: '2023-07-01', heightCm: 149, weightKg: 42, shoeSizeUs: 9 },
    { measurementDate: '2024-01-01', heightCm: 156, weightKg: 46, shoeSizeUs: 9.5 },
    { measurementDate: '2024-07-01', heightCm: 163, weightKg: 51, shoeSizeUs: 10 },
    { measurementDate: '2025-01-01', heightCm: 169, weightKg: 57, shoeSizeUs: 10 },
    { measurementDate: '2025-07-01', heightCm: 173, weightKg: 62, shoeSizeUs: 10 },
    {
      measurementDate: '2026-01-01', heightCm: 175, weightKg: 64, shoeSizeUs: 10,
      tannerStage: 4, boneAgeYears: 14.5,
    },
  ];
  const latest = heights[heights.length - 1];
  const out = combinePredictions({
    sex: 'male',
    birthDate: '2012-01-01',
    measurementDate: latest.measurementDate,
    currentHeightCm: latest.heightCm,
    currentWeightKg: latest.weightKg,
    motherHeightCm: 165,
    fatherHeightCm: 180,
    siblings: [{ sex: 'male', adultHeightCm: 184 }],
    boneAgeYears: latest.boneAgeYears,
    tannerStage: latest.tannerStage,
    heights,
  });
  truthy(out.consensus != null, 'integration: consensus present');
  truthy(out.consensus.points.length >= 4, 'integration: 4+ predictors active');
  truthy(out.consensus.sdCm < 3.0, 'integration: consensus SD tight with full data');
  truthy(out.activeSignals.length >= 4, 'integration: multiple active signals');
  truthy(out.consensus.predictedAdultHeightCm > 175, 'integration: predicted taller than current');
  truthy(out.consensus.predictedAdultHeightCm < 195, 'integration: predicted within sane range');
  // Bone age should carry meaningful weight (tight SD)
  const ba = out.consensus.points.find((p) => p.label === 'Bone age');
  truthy(ba != null && ba.weight > 0.2, 'integration: bone-age weight meaningful');
}
{
  // Opposite: 4yo with only parent heights -> should fall back to MPH alone
  const out = combinePredictions({
    sex: 'female',
    birthDate: '2022-01-01',
    measurementDate: '2026-01-01',
    currentHeightCm: 105,
    motherHeightCm: 165,
    fatherHeightCm: 180,
  });
  truthy(out.consensus != null, 'integration: 4yo consensus works');
  truthy(out.consensus.sdCm >= 3.0, 'integration: SD wider for 4yo without tempo data');
  truthy(out.activeSignals.length === 0, 'integration: 4yo no active tempo signals');
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of fails) console.log(f);
  process.exit(1);
}
