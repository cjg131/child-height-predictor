// PredictionPanel — run all three predictors and show the consensus plus
// per-method breakdown.
//
// Design: lead with a single "best guess" number in familiar feet/inches,
// then show a confidence range, then list the three methods so the user can
// see which agree and which don't. Bad inputs (missing parents, under age 4,
// no measurement yet) degrade gracefully — we just drop that method and
// tell the user why.
//
// Zero-measurement path: if both parents are set but no heights are logged
// yet, mid-parental alone still produces a prediction. As the user adds
// measurements, Khamis-Roche and CDC percentile kick in and refine the
// consensus.

import React, { useMemo } from 'react';
import { combinePredictions } from '../predictions/index.js';
import { formatFeetInches } from '../lib/units.js';

function MethodRow({ label, cm, sdCm, note }) {
  return (
    <tr className="border-t border-slate-200">
      <td className="py-2 pr-4 text-slate-700">{label}</td>
      <td className="py-2 pr-4 font-medium text-slate-900">
        {cm == null ? (
          <span className="text-slate-400">not available</span>
        ) : (
          <>
            {formatFeetInches(cm)}{' '}
            <span className="text-slate-500 font-normal text-xs">
              ({cm.toFixed(1)} cm)
            </span>
          </>
        )}
      </td>
      <td className="py-2 text-slate-500 text-xs">
        {sdCm != null && cm != null
          ? `± ${(2 * sdCm).toFixed(1)} cm (95%)`
          : note || ''}
      </td>
    </tr>
  );
}

export default function PredictionPanel({ child, latest }) {
  const hasMeasurement = latest != null;

  const prediction = useMemo(() => {
    return combinePredictions({
      sex: child.sex,
      birthDate: child.birthDate,
      measurementDate: latest?.measurementDate ?? null,
      currentHeightCm: latest?.heightCm ?? null,
      currentWeightKg: latest?.weightKg ?? null,
      motherHeightCm: child.motherHeightCm ?? null,
      fatherHeightCm: child.fatherHeightCm ?? null,
    });
  }, [child, latest]);

  if (!prediction || !prediction.consensus) {
    return (
      <p className="text-sm text-slate-500">
        Fill in both parent heights on {child.name}'s profile, or add a height
        measurement below. Either one gets you a first estimate; together they
        refine it.
      </p>
    );
  }

  const { results, consensus, spreadCm } = prediction;
  const consCm = consensus.predictedAdultHeightCm;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Best estimate
        </p>
        <p className="text-3xl font-semibold text-brand-700">
          {formatFeetInches(consCm)}
        </p>
        <p className="text-sm text-slate-600">
          95% range: {formatFeetInches(consensus.rangeLowCm)} to {formatFeetInches(consensus.rangeHighCm)}
          {' '}({consensus.rangeLowCm.toFixed(1)}–{consensus.rangeHighCm.toFixed(1)} cm)
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Based on {consensus.pointCount} method{consensus.pointCount === 1 ? '' : 's'}.
          {spreadCm != null && spreadCm > 10 && (
            <> Methods disagree by {spreadCm.toFixed(1)} cm, take with a grain of salt.</>
          )}
        </p>
        {!hasMeasurement && (
          <p className="text-xs text-brand-700 mt-2">
            Parent heights only. Add a measurement below and the prediction
            will refine.
          </p>
        )}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          By method
        </p>
        <table className="w-full text-sm">
          <tbody>
            <MethodRow
              label="Mid-parental"
              cm={results.midParental?.targetCm}
              sdCm={results.midParental?.sdCm}
              note={!results.midParental ? 'Add both parents on profile' : ''}
            />
            <MethodRow
              label="Khamis-Roche"
              cm={results.khamisRoche?.inAgeRange ? results.khamisRoche.predictedAdultHeightCm : null}
              sdCm={results.khamisRoche?.inAgeRange ? results.khamisRoche.sdCm : null}
              note={
                !results.khamisRoche
                  ? (hasMeasurement ? 'Needs height, weight, parents' : 'Needs a height measurement')
                  : !results.khamisRoche.inAgeRange
                    ? 'Child outside age 4-17.5'
                    : ''
              }
            />
            <MethodRow
              label="CDC percentile"
              cm={results.cdcPercentile?.predictedAdultHeightCm}
              sdCm={results.cdcPercentile?.sdCm}
              note={!results.cdcPercentile && !hasMeasurement ? 'Needs a height measurement' : ''}
            />
          </tbody>
        </table>
      </div>

      {results.cdcPercentile && (
        <p className="text-xs text-slate-500">
          Current stature percentile: {results.cdcPercentile.currentPercentile.toFixed(1)}th
          {' '}(z = {results.cdcPercentile.currentZ.toFixed(2)})
        </p>
      )}

      <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-200 pt-2">
        These are estimates based on population averages. Every child is different,
        and growth can surprise you, especially around puberty. If you're worried
        about growth, talk to your pediatrician.
      </p>
    </div>
  );
}
