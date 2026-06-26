import React, { useMemo, useState } from 'react';
import {
  inToCm, lbOzToKg, formatFeetInchesPrecise,
} from '../lib/units.js';

function ftInToInches(ft, inches) {
  const f = Number(ft) || 0;
  const i = Number(inches) || 0;
  if (f <= 0 && i <= 0) return null;
  return f * 12 + i;
}

export default function AddHeightForm({ onAdd }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightLb, setWeightLb] = useState('');
  const [weightOz, setWeightOz] = useState('');
  const [tannerStage, setTannerStage] = useState(''); // '' | '1'..'5'
  const [shoeSizeUs, setShoeSizeUs] = useState('');   // optional numeric
  const [boneAgeYears, setBoneAgeYears] = useState(''); // optional numeric
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const heightPreview = useMemo(() => {
    const total = ftInToInches(heightFt, heightIn);
    if (total == null || total <= 0) return null;
    const cm = inToCm(total);
    return formatFeetInchesPrecise(cm);
  }, [heightFt, heightIn]);

  const weightPreview = useMemo(() => {
    const lb = Number(weightLb) || 0;
    const oz = Number(weightOz) || 0;
    if (lb + oz <= 0) return null;
    const kg = lbOzToKg(lb, oz);
    const totalLb = lb + oz / 16;
    return `${totalLb.toFixed(2)} lb · ${kg.toFixed(2)} kg`;
  }, [weightLb, weightOz]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const total = ftInToInches(heightFt, heightIn);
    if (total == null || total <= 0) {
      setError('Enter a height in feet and inches');
      return;
    }
    const heightCm = inToCm(total);
    const weightKg = lbOzToKg(weightLb, weightOz);
    setBusy(true);
    try {
      await onAdd({
        measurementDate: date,
        heightCm,
        weightKg,
        tannerStage: tannerStage ? Number(tannerStage) : null,
        shoeSizeUs: shoeSizeUs ? Number(shoeSizeUs) : null,
        boneAgeYears: boneAgeYears ? Number(boneAgeYears) : null,
        note: note || null,
      });
      setHeightFt(''); setHeightIn('');
      setWeightLb(''); setWeightOz('');
      setTannerStage(''); setShoeSizeUs(''); setBoneAgeYears('');
      setNote('');
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700">Date</label>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Height</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <input type="number" min="0" max="7" step="1" value={heightFt}
            onChange={(e) => setHeightFt(e.target.value)}
            placeholder="ft"
            className="w-full border border-slate-300 rounded px-3 py-2" />
          <input type="number" min="0" max="11.75" step="0.25" value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
            placeholder="in"
            className="w-full border border-slate-300 rounded px-3 py-2" />
        </div>
        {heightPreview && <p className="text-xs text-slate-500 mt-1">= {heightPreview}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Weight (optional)</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <input type="number" min="0" max="500" step="1" value={weightLb}
            onChange={(e) => setWeightLb(e.target.value)}
            placeholder="lb"
            className="w-full border border-slate-300 rounded px-3 py-2" />
          <input type="number" min="0" max="15.9" step="0.1" value={weightOz}
            onChange={(e) => setWeightOz(e.target.value)}
            placeholder="oz"
            className="w-full border border-slate-300 rounded px-3 py-2" />
        </div>
        {weightPreview && <p className="text-xs text-slate-500 mt-1">= {weightPreview}</p>}
        <p className="text-xs text-slate-500 mt-1">Weight improves the Khamis-Roche prediction.</p>
      </div>

      <button type="button" onClick={() => setShowAdvanced((v) => !v)}
        className="text-sm text-brand-600 hover:text-brand-700 underline">
        {showAdvanced ? 'Hide' : 'Show'} extra signals (Tanner, shoe, bone age)
      </button>

      {showAdvanced && (
        <div className="space-y-3 bg-slate-50 rounded p-3 border border-slate-200">
          <div>
            <label className="block text-sm font-medium text-slate-700">Tanner stage (optional)</label>
            <select value={tannerStage} onChange={(e) => setTannerStage(e.target.value)}
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2 bg-white">
              <option value="">Not recorded</option>
              <option value="1">Stage 1 (pre-puberty)</option>
              <option value="2">Stage 2 (early puberty)</option>
              <option value="3">Stage 3 (mid puberty, growth peak)</option>
              <option value="4">Stage 4 (late puberty, growth slowing)</option>
              <option value="5">Stage 5 (adult, growth complete)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Where the child is in puberty. Clinician-assessed or self-reported.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Shoe size (US, optional)
            </label>
            <input type="number" min="0" max="20" step="0.5" value={shoeSizeUs}
              onChange={(e) => setShoeSizeUs(e.target.value)}
              placeholder="e.g. 7.5"
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
            <p className="text-[11px] text-slate-500 mt-1">
              Kids' and adult scales differ. Just use what's printed on the shoe.
              A plateau for 12+ months signals growth is ending.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Bone age (years, optional)
            </label>
            <input type="number" min="0" max="20" step="0.25" value={boneAgeYears}
              onChange={(e) => setBoneAgeYears(e.target.value)}
              placeholder="e.g. 11.5"
              className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
            <p className="text-[11px] text-slate-500 mt-1">
              From a pediatric hand/wrist X-ray. If provided, this becomes the
              strongest signal in the consensus.
            </p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          placeholder="Doctor visit, growth spurt, etc." />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="bg-brand-600 hover:bg-brand-700 text-white rounded px-4 py-2 font-medium disabled:opacity-50">
        {busy ? 'Saving...' : 'Save measurement'}
      </button>
    </form>
  );
}
