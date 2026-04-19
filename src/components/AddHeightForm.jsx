import React, { useState } from 'react';
import { inToCm, lbToKg } from '../lib/units.js';

export default function AddHeightForm({ onAdd }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weightLb, setWeightLb] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const f = Number(feet), i = Number(inches);
    if (!Number.isFinite(f) || !Number.isFinite(i) || f + i <= 0) {
      setError('Enter a height');
      return;
    }
    const heightCm = inToCm(f * 12 + i);
    const weightKg = weightLb ? lbToKg(Number(weightLb)) : null;
    setBusy(true);
    try {
      await onAdd({
        measurementDate: date,
        heightCm,
        weightKg,
        note: note || null,
      });
      setFeet(''); setInches(''); setWeightLb(''); setNote('');
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Height: ft</label>
          <input type="number" min="1" max="7" value={feet}
            onChange={(e) => setFeet(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Height: in</label>
          <input type="number" min="0" max="11" step="0.25" value={inches}
            onChange={(e) => setInches(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Weight (lb, optional)</label>
        <input type="number" min="0" step="0.1" value={weightLb}
          onChange={(e) => setWeightLb(e.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
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
