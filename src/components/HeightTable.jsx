// HeightTable — list of measurements with inline edit + delete.
//
// Each row expands into an edit form when the user clicks "edit". The form
// mirrors AddHeightForm (ft + in for height, lb + oz for weight, date +
// note) but pre-filled from the row's current values. Save runs the
// onUpdate callback with the new data in metric units (same shape as the
// original Firestore doc); cancel just collapses without saving.

import React, { useMemo, useState } from 'react';
import {
  formatHeight, kgToLb, cmToIn, inToCm, lbOzToKg, kgToLbOz,
  formatFeetInchesPrecise, ageInYears,
} from '../lib/units.js';
import { cdcStatureZ, zToPercentile } from '../predictions/cdcPercentile.js';

function ftInToInches(ft, inches) {
  const f = Number(ft) || 0;
  const i = Number(inches) || 0;
  if (f <= 0 && i <= 0) return null;
  return f * 12 + i;
}

function cmToFtIn(cm) {
  const totalIn = cmToIn(cm);
  const ft = Math.floor(totalIn / 12);
  const inches = totalIn - ft * 12;
  // Round inches to nearest 0.25 to line up with the step on the input.
  const rounded = Math.round(inches * 4) / 4;
  if (rounded >= 12) return { ft: ft + 1, inches: 0 };
  return { ft, inches: rounded };
}

function EditRow({ h, onSave, onCancel }) {
  const initial = cmToFtIn(h.heightCm);
  const initialWeight = h.weightKg != null ? kgToLbOz(h.weightKg) : { lb: 0, oz: 0 };

  const [date, setDate] = useState(h.measurementDate);
  const [heightFt, setHeightFt] = useState(String(initial.ft));
  const [heightIn, setHeightIn] = useState(String(initial.inches));
  const [weightLb, setWeightLb] = useState(
    h.weightKg != null ? String(initialWeight.lb) : ''
  );
  const [weightOz, setWeightOz] = useState(
    h.weightKg != null ? String(initialWeight.oz) : ''
  );
  const [tannerStage, setTannerStage] = useState(h.tannerStage != null ? String(h.tannerStage) : '');
  const [shoeSizeUs, setShoeSizeUs] = useState(h.shoeSizeUs != null ? String(h.shoeSizeUs) : '');
  const [boneAgeYears, setBoneAgeYears] = useState(h.boneAgeYears != null ? String(h.boneAgeYears) : '');
  const [note, setNote] = useState(h.note || '');
  const [showAdvanced, setShowAdvanced] = useState(
    h.tannerStage != null || h.shoeSizeUs != null || h.boneAgeYears != null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const heightPreview = useMemo(() => {
    const total = ftInToInches(heightFt, heightIn);
    if (total == null || total <= 0) return null;
    const cm = inToCm(total);
    return formatFeetInchesPrecise(cm);
  }, [heightFt, heightIn]);

  const save = async () => {
    setError(null);
    const total = ftInToInches(heightFt, heightIn);
    if (total == null || total <= 0) {
      setError('Enter a height');
      return;
    }
    const heightCm = inToCm(total);
    const lb = Number(weightLb) || 0;
    const oz = Number(weightOz) || 0;
    const weightKg = (lb + oz > 0) ? lbOzToKg(lb, oz) : null;
    setBusy(true);
    try {
      await onSave({
        measurementDate: date,
        heightCm,
        weightKg,
        tannerStage: tannerStage ? Number(tannerStage) : null,
        shoeSizeUs: shoeSizeUs ? Number(shoeSizeUs) : null,
        boneAgeYears: boneAgeYears ? Number(boneAgeYears) : null,
        note: note || null,
      });
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="bg-brand-50 border-b border-slate-100">
      <td colSpan={7} className="py-3 px-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-600">Date</label>
            <input type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-600">Height</label>
            <div className="grid grid-cols-2 gap-1">
              <input type="number" min="0" max="7" step="1" value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                placeholder="ft"
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
              <input type="number" min="0" max="11.75" step="0.25" value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                placeholder="in"
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
            {heightPreview && (
              <p className="text-[11px] text-slate-500 mt-0.5">= {heightPreview}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-600">Weight (optional)</label>
            <div className="grid grid-cols-2 gap-1">
              <input type="number" min="0" max="500" step="1" value={weightLb}
                onChange={(e) => setWeightLb(e.target.value)}
                placeholder="lb"
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
              <input type="number" min="0" max="15.9" step="0.1" value={weightOz}
                onChange={(e) => setWeightOz(e.target.value)}
                placeholder="oz"
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
              placeholder="optional" />
          </div>
        </div>
        <button type="button" onClick={() => setShowAdvanced((v) => !v)}
          className="mt-2 text-xs text-brand-600 hover:text-brand-700 underline">
          {showAdvanced ? 'Hide' : 'Show'} extra signals
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 bg-white rounded p-2 border border-slate-200">
            <div>
              <label className="block text-xs text-slate-600">Tanner</label>
              <select value={tannerStage} onChange={(e) => setTannerStage(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm bg-white">
                <option value="">—</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600">Shoe (US)</label>
              <input type="number" min="0" max="20" step="0.5" value={shoeSizeUs}
                onChange={(e) => setShoeSizeUs(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Bone age (yr)</label>
              <input type="number" min="0" max="20" step="0.25" value={boneAgeYears}
                onChange={(e) => setBoneAgeYears(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={save} disabled={busy}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1 text-sm font-medium disabled:opacity-50">
            {busy ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onCancel}
            className="bg-slate-200 hover:bg-slate-300 rounded px-3 py-1 text-sm">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function HeightTable({ heights, child, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);

  if (!heights.length) return <p className="text-slate-600">No measurements yet.</p>;

  const handleSave = async (id, data) => {
    await onUpdate(id, data);
    setEditingId(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-600 border-b border-slate-200">
          <tr>
            <th className="py-2">Date</th>
            <th>Age</th>
            <th>Height</th>
            <th>%ile</th>
            <th>Weight</th>
            <th>Note</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {heights.slice().reverse().map((h) => {
            const age = ageInYears(child.birthDate, h.measurementDate);
            const z = cdcStatureZ({
              sex: child.sex,
              birthDate: child.birthDate,
              measurementDate: h.measurementDate,
              heightCm: h.heightCm,
            });
            const isEditing = editingId === h.id;
            if (isEditing) {
              return (
                <EditRow
                  key={h.id}
                  h={h}
                  onSave={(data) => handleSave(h.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              );
            }
            return (
              <tr key={h.id} className="border-b border-slate-100">
                <td className="py-2">{h.measurementDate}</td>
                <td>{age.toFixed(1)}</td>
                <td>{formatHeight(h.heightCm)}</td>
                <td>{zToPercentile(z.z).toFixed(0)}</td>
                <td>{h.weightKg ? `${kgToLb(h.weightKg).toFixed(1)} lb` : '-'}</td>
                <td className="text-slate-600">{h.note || ''}</td>
                <td className="whitespace-nowrap">
                  <button onClick={() => setEditingId(h.id)}
                    className="text-brand-600 hover:text-brand-700 text-xs mr-2">
                    edit
                  </button>
                  <button onClick={() => onDelete(h.id)}
                    className="text-red-600 hover:text-red-700 text-xs">
                    delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
