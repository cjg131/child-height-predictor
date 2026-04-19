// ChildProfileForm — the shared editor for child profile fields. Used by
// NewChildPage for creation and by ChildDetailPage for in-place edits.
//
// Height inputs are ft + in (blank ft counts as 0). Submission passes a
// data object with name, birthDate, sex, motherHeightCm, fatherHeightCm,
// siblings back to the parent, which decides whether to create or update.
//
// Siblings captures ADULT brothers/sisters only (their height is settled).
// This is an independent genetic signal beyond parents.

import React, { useMemo, useState } from 'react';
import { inToCm, cmToIn, formatFeetInchesPrecise } from '../lib/units.js';

function ftInToInches(ft, inches) {
  const f = Number(ft) || 0;
  const i = Number(inches) || 0;
  if (f <= 0 && i <= 0) return null;
  return f * 12 + i;
}

function cmToFtIn(cm) {
  if (cm == null) return { ft: '', inches: '' };
  const totalIn = cmToIn(cm);
  const ft = Math.floor(totalIn / 12);
  const inches = totalIn - ft * 12;
  const rounded = Math.round(inches * 4) / 4;
  if (rounded >= 12) return { ft: String(ft + 1), inches: '0' };
  return { ft: String(ft), inches: String(rounded) };
}

function HeightFtIn({ label, ft, inches, onChangeFt, onChangeIn, compact }) {
  const preview = useMemo(() => {
    const total = ftInToInches(ft, inches);
    if (total == null || total <= 0) return null;
    const cm = inToCm(total);
    return formatFeetInchesPrecise(cm);
  }, [ft, inches]);

  return (
    <div>
      {label && <label className="block text-xs text-slate-600">{label}</label>}
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" max="7" step="1" value={ft}
          onChange={(e) => onChangeFt(e.target.value)}
          placeholder="ft"
          className="w-full border border-slate-300 rounded px-2 py-1" />
        <input type="number" min="0" max="11.75" step="0.25" value={inches}
          onChange={(e) => onChangeIn(e.target.value)}
          placeholder="in"
          className="w-full border border-slate-300 rounded px-2 py-1" />
      </div>
      {!compact && preview && <p className="text-[11px] text-slate-500 mt-0.5">= {preview}</p>}
    </div>
  );
}

function SiblingRow({ sibling, onChange, onRemove }) {
  const ftIn = cmToFtIn(sibling.adultHeightCm);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
      <select value={sibling.sex}
        onChange={(e) => onChange({ ...sibling, sex: e.target.value })}
        className="border border-slate-300 rounded px-2 py-1 bg-white text-sm">
        <option value="male">Brother</option>
        <option value="female">Sister</option>
      </select>
      <HeightFtIn compact
        ft={ftIn.ft} inches={ftIn.inches}
        onChangeFt={(v) => {
          const total = ftInToInches(v, ftIn.inches);
          onChange({ ...sibling, adultHeightCm: total == null ? null : inToCm(total) });
        }}
        onChangeIn={(v) => {
          const total = ftInToInches(ftIn.ft, v);
          onChange({ ...sibling, adultHeightCm: total == null ? null : inToCm(total) });
        }}
      />
      <button type="button" onClick={onRemove}
        className="text-red-600 hover:text-red-700 text-sm underline">
        remove
      </button>
    </div>
  );
}

export default function ChildProfileForm({
  initial = null,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}) {
  const initMom = cmToFtIn(initial?.motherHeightCm ?? null);
  const initDad = cmToFtIn(initial?.fatherHeightCm ?? null);

  const [name, setName] = useState(initial?.name ?? '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '');
  const [sex, setSex] = useState(initial?.sex ?? 'male');
  const [motherFt, setMotherFt] = useState(initMom.ft);
  const [motherIn, setMotherIn] = useState(initMom.inches);
  const [fatherFt, setFatherFt] = useState(initDad.ft);
  const [fatherIn, setFatherIn] = useState(initDad.inches);
  const [siblings, setSiblings] = useState(
    Array.isArray(initial?.siblings) ? initial.siblings : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const parseHeight = (ft, inches) => {
    const total = ftInToInches(ft, inches);
    if (total == null || total <= 0) return null;
    return inToCm(total);
  };

  const updateSibling = (i, next) => {
    setSiblings((prev) => prev.map((s, idx) => (idx === i ? next : s)));
  };
  const addSibling = () => {
    setSiblings((prev) => [...prev, { sex: 'male', adultHeightCm: null }]);
  };
  const removeSibling = (i) => {
    setSiblings((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name,
        birthDate,
        sex,
        motherHeightCm: parseHeight(motherFt, motherIn),
        fatherHeightCm: parseHeight(fatherFt, fatherIn),
        siblings: siblings.filter((s) => s.adultHeightCm != null),
      });
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700">Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Birthday</label>
        <input type="date" required value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Sex (for growth charts)</label>
        <select value={sex} onChange={(e) => setSex(e.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2 bg-white">
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>
      <fieldset className="border border-slate-200 rounded p-3">
        <legend className="text-sm font-medium text-slate-700 px-1">
          Parent heights (optional, improves predictions)
        </legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
          <HeightFtIn label="Mother"
            ft={motherFt} inches={motherIn}
            onChangeFt={setMotherFt} onChangeIn={setMotherIn} />
          <HeightFtIn label="Father"
            ft={fatherFt} inches={fatherIn}
            onChangeFt={setFatherFt} onChangeIn={setFatherIn} />
        </div>
      </fieldset>
      <fieldset className="border border-slate-200 rounded p-3">
        <legend className="text-sm font-medium text-slate-700 px-1">
          Adult siblings (optional, tightens genetic target)
        </legend>
        <p className="text-[11px] text-slate-500 mb-2">
          Only adult brothers/sisters whose height is settled. Leave blank for
          siblings who are still growing.
        </p>
        <div className="space-y-2">
          {siblings.map((s, i) => (
            <SiblingRow key={i} sibling={s}
              onChange={(next) => updateSibling(i, next)}
              onRemove={() => removeSibling(i)} />
          ))}
        </div>
        <button type="button" onClick={addSibling}
          className="mt-2 text-sm text-brand-600 hover:text-brand-700 underline">
          + Add adult sibling
        </button>
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="bg-brand-600 hover:bg-brand-700 text-white rounded px-4 py-2 font-medium disabled:opacity-50">
          {busy ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="bg-slate-200 hover:bg-slate-300 rounded px-4 py-2">
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
  );
}
