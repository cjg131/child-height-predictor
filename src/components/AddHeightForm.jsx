import React, { useMemo, useState } from 'react';
import {
  inToCm, lbOzToKg, formatFeetInchesPrecise,
} from '../lib/units.js';

// Convert ft + in fields to total inches. Blank ft counts as 0 so a user
// can type just inches if they want.
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
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const heightPreview = useMemo(() => {
    const total = ftInToInches(heightFt, heightIn);
    if (total == null || total <= 0) return null;
    const cm = inToCm(total);
    return `${formatFeetInchesPrecise(cm)} · ${cm.toFixed(1)} cm`;
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
        note: note || null,
      });
      setHeightFt(''); setHeightIn('');
      setWeightLb(''); setWeightOz(''); setNote('');
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
        <label className="block text-sm font-medium text-slate-700">
          Height
        </label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div>
            <input type="number" min="0" max="7" step="1" value={heightFt}
              onChange={(e) => setHeightFt(e.target.value)}
              placeholder="ft"
              className="w-full border border-slate-300 rounded px-3 py-2" />
          </div>
          <div>
            <input type="number" min="0" max="11.75" step="0.25" value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              placeholder="in"
              className="w-full border border-slate-300 rounded px-3 py-2" />
          </div>
        </div>
        {heightPreview && (
          <p className="text-xs text-slate-500 mt-1">= {heightPreview}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Weight (optional)
        </label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div>
            <input type="number" min="0" max="500" step="1" value={weightLb}
              onChange={(e) => setWeightLb(e.target.value)}
              placeholder="lb"
              className="w-full border border-slate-300 rounded px-3 py-2" />
          </div>
          <div>
            <input type="number" min="0" max="15.9" step="0.1" value={weightOz}
              onChange={(e) => setWeightOz(e.target.value)}
              placeholder="oz"
              className="w-full border border-slate-300 rounded px-3 py-2" />
          </div>
        </div>
        {weightPreview && (
          <p className="text-xs text-slate-500 mt-1">= {weightPreview}</p>
        )}
        <p className="text-xs text-slate-500 mt-1">Weight improves the Khamis-Roche prediction.</p>
      </div>

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
