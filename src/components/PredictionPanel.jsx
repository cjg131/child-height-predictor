// PredictionPanel - consensus + per-method breakdown + active signals.
//
// The panel runs combinePredictions() with the full measurement history so
// that velocity, BMI trajectory, and shoe-size signals can kick in. Latest
// measurement's optional fields (Tanner, bone age) are surfaced to the
// engine as well.

import React, { useMemo } from 'react';
import { combinePredictions } from '../predictions/index.js';
import { formatFeetInches, cmToIn } from '../lib/units.js';

function MethodRow({ label, cm, sdCm, weightPct, note }) {
  return (
    <tr className="border-t border-slate-200">
      <td className="py-2 pr-4 text-slate-700">{label}</td>
      <td className="py-2 pr-4 font-medium text-slate-900">
        {cm == null ? (
          <span className="text-slate-400">not available</span>
        ) : (
          formatFeetInches(cm)
        )}
      </td>
      <td className="py-2 pr-4 text-slate-500 text-xs">
        {sdCm != null && cm != null
          ? `± ${(2 * cmToIn(sdCm)).toFixed(1)} in`
          : note || ''}
      </td>
      <td className="py-2 text-xs text-slate-500 text-right">
        {weightPct != null ? `${weightPct.toFixed(0)}%` : ''}
      </td>
    </tr>
  );
}

function SignalBadge({ signal, state, detail }) {
  const palette = {
    velocity:       'bg-blue-50 text-blue-700 border-blue-200',
    'bmi-rebound':  'bg-amber-50 text-amber-700 border-amber-200',
    shoe:           'bg-emerald-50 text-emerald-700 border-emerald-200',
    tanner:         'bg-violet-50 text-violet-700 border-violet-200',
    'bone-age':     'bg-rose-50 text-rose-700 border-rose-200',
    siblings:       'bg-indigo-50 text-indigo-700 border-indigo-200',
  };
  const cls = palette[signal] || 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      <span className="font-medium capitalize">{signal.replace('-', ' ')}:</span>
      <span>{state}</span>
      {detail && <span className="text-slate-500">({detail})</span>}
    </span>
  );
}

export default function PredictionPanel({ child, latest, heights = [] }) {
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
      siblings: child.siblings || [],
      boneAgeYears: latest?.boneAgeYears ?? null,
      tannerStage: latest?.tannerStage ?? null,
      heights,
    });
  }, [child, latest, heights]);

  if (!prediction || !prediction.consensus) {
    return (
      <p className="text-sm text-slate-500">
        Fill in both parent heights on {child.name}'s profile, or add a height
        measurement below. Either one gets you a first estimate; together they
        refine it.
      </p>
    );
  }

  const { results, consensus, spreadCm, activeSignals } = prediction;
  const consCm = consensus.predictedAdultHeightCm;
  const spreadIn = spreadCm != null ? cmToIn(spreadCm) : null;

  const pointByLabel = {};
  for (const p of consensus.points) pointByLabel[p.label] = p;

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
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Weighted average of {consensus.pointCount} method{consensus.pointCount === 1 ? '' : 's'}.
          {spreadIn != null && spreadIn > 4 && (
            <> Methods disagree by {spreadIn.toFixed(1)} in, take with a grain of salt.</>
          )}
        </p>
        {!hasMeasurement && (
          <p className="text-xs text-brand-700 mt-2">
            Parent heights only. Add a measurement below and the prediction will refine.
          </p>
        )}
      </div>

      {activeSignals && activeSignals.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Active signals
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeSignals.map((s, i) => (
              <SignalBadge key={i} signal={s.signal} state={s.state} detail={s.detail} />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          By method
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="text-left font-normal pb-1">Method</th>
              <th className="text-left font-normal pb-1">Estimate</th>
              <th className="text-left font-normal pb-1">± 95%</th>
              <th className="text-right font-normal pb-1">Weight</th>
            </tr>
          </thead>
          <tbody>
            {results.siblingAdjusted ? (
              <MethodRow
                label="Sibling-adjusted"
                cm={results.siblingAdjusted.targetCm}
                sdCm={results.siblingAdjusted.sdCm}
                weightPct={pointByLabel['Sibling-adjusted']?.weight != null
                  ? pointByLabel['Sibling-adjusted'].weight * 100 : null}
              />
            ) : (
              <MethodRow
                label="Mid-parental"
                cm={results.midParental?.targetCm}
                sdCm={results.midParental?.sdCm}
                weightPct={pointByLabel['Mid-parental']?.weight != null
                  ? pointByLabel['Mid-parental'].weight * 100 : null}
                note={!results.midParental ? 'Add both parents on profile' : ''}
              />
            )}
            <MethodRow
              label="Khamis-Roche"
              cm={results.khamisRoche?.inAgeRange ? results.khamisRoche.predictedAdultHeightCm : null}
              sdCm={results.khamisRoche?.inAgeRange ? results.khamisRoche.sdCm : null}
              weightPct={pointByLabel['Khamis-Roche']?.weight != null
                ? pointByLabel['Khamis-Roche'].weight * 100 : null}
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
              weightPct={pointByLabel['CDC percentile']?.weight != null
                ? pointByLabel['CDC percentile'].weight * 100 : null}
              note={!results.cdcPercentile && !hasMeasurement ? 'Needs a height measurement' : ''}
            />
            {results.boneAge && (
              <MethodRow
                label="Bone age (Bayley-Pinneau)"
                cm={results.boneAge.predictedAdultHeightCm}
                sdCm={results.boneAge.sdCm}
                weightPct={pointByLabel['Bone age']?.weight != null
                  ? pointByLabel['Bone age'].weight * 100 : null}
              />
            )}
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
