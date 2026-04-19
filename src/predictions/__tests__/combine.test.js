import { describe, it, expect } from 'vitest';
import { combinePredictions } from '../combine.js';
import { inToCm, lbToKg } from '../../lib/units.js';

describe('combinePredictions', () => {
  const child = {
    sex: 'male',
    birthDate: '2014-02-27',
    measurementDate: '2026-04-19',
    currentHeightCm: inToCm(59),     // ~150 cm, about 50th percentile at 12
    currentWeightKg: lbToKg(90),
    motherHeightCm: inToCm(65),
    fatherHeightCm: inToCm(72),
  };

  it('produces all three methods when every input is supplied', () => {
    const { results, consensus, spreadCm } = combinePredictions(child);
    expect(results.midParental).toBeTruthy();
    expect(results.khamisRoche).toBeTruthy();
    expect(results.cdcPercentile).toBeTruthy();
    expect(consensus).toBeTruthy();
    expect(spreadCm).toBeGreaterThanOrEqual(0);
  });

  it('skips Khamis-Roche when no parent data is available', () => {
    const { results } = combinePredictions({
      ...child,
      motherHeightCm: null,
      fatherHeightCm: null,
    });
    expect(results.khamisRoche).toBeFalsy();
    expect(results.midParental).toBeFalsy();
    expect(results.cdcPercentile).toBeTruthy();
  });

  it('inverse-variance weighting gives Khamis-Roche more pull than mid-parental', () => {
    // Fabricate a case where mid-parental and KR disagree by a lot, and
    // verify the consensus lands closer to KR because its SD is smaller.
    const { consensus, results } = combinePredictions(child);
    const gapToKr = Math.abs(consensus.predictedAdultHeightCm - results.khamisRoche.predictedAdultHeightCm);
    const gapToMph = Math.abs(consensus.predictedAdultHeightCm - results.midParental.targetCm);
    expect(gapToKr).toBeLessThan(gapToMph + 1e-6);
  });

  it('consensus range widens when fewer methods contribute', () => {
    const full = combinePredictions(child);
    const partial = combinePredictions({
      ...child, motherHeightCm: null, fatherHeightCm: null,
    });
    expect(partial.consensus.sdCm).toBeGreaterThanOrEqual(full.consensus.sdCm);
  });
});
