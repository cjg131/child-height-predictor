// ParentsPage — facts about the parents, shared by every child.
//
// Parent heights and pubertal timing describe the parents, not any one child,
// so they are entered once here rather than repeated on each child's profile.

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getFamily, saveFamily } from '../lib/family.js';
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
  const rounded = Math.round((totalIn - ft * 12) * 4) / 4;
  if (rounded >= 12) return { ft: String(ft + 1), inches: '0' };
  return { ft: String(ft), inches: String(rounded) };
}

function HeightFtIn({ label, ft, inches, onChangeFt, onChangeIn }) {
  const preview = useMemo(() => {
    const total = ftInToInches(ft, inches);
    if (total == null || total <= 0) return null;
    return formatFeetInchesPrecise(inToCm(total));
  }, [ft, inches]);

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <input
          type="number" min="0" max="8" step="1" value={ft}
          onChange={(e) => onChangeFt(e.target.value)} placeholder="ft"
          className="w-full border border-slate-300 rounded px-3 py-2"
        />
        <input
          type="number" min="0" max="11.75" step="0.25" value={inches}
          onChange={(e) => onChangeIn(e.target.value)} placeholder="in"
          className="w-full border border-slate-300 rounded px-3 py-2"
        />
      </div>
      {preview && <p className="text-xs text-slate-500 mt-1">= {preview}</p>}
    </div>
  );
}

export default function ParentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [momFt, setMomFt] = useState('');
  const [momIn, setMomIn] = useState('');
  const [dadFt, setDadFt] = useState('');
  const [dadIn, setDadIn] = useState('');
  const [menarche, setMenarche] = useState('');
  const [fatherMaturation, setFatherMaturation] = useState('');

  useEffect(() => {
    if (!user) return;
    getFamily(user.uid)
      .then((f) => {
        if (!f) return;
        const m = cmToFtIn(f.motherHeightCm ?? null);
        const d = cmToFtIn(f.fatherHeightCm ?? null);
        setMomFt(m.ft); setMomIn(m.inches);
        setDadFt(d.ft); setDadIn(d.inches);
        setMenarche(
          f.motherMenarcheAgeYears != null ? String(f.motherMenarcheAgeYears) : '',
        );
        setFatherMaturation(f.fatherMaturation ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const parseHeight = (ft, inches) => {
    const total = ftInToInches(ft, inches);
    return total == null || total <= 0 ? null : inToCm(total);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await saveFamily(user.uid, {
        motherHeightCm: parseHeight(momFt, momIn),
        fatherHeightCm: parseHeight(dadFt, dadIn),
        motherMenarcheAgeYears: menarche ? Number(menarche) : null,
        fatherMaturation: fatherMaturation || null,
      });
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Parents</h2>
        <Link to="/" className="text-sm text-brand-600 hover:text-brand-700 underline">
          Back to kids
        </Link>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        These apply to every child, so you only enter them once.
      </p>

      <form onSubmit={submit} className="space-y-4 bg-white rounded-lg shadow p-4">
        <fieldset className="border border-slate-200 rounded p-3">
          <legend className="text-sm font-medium text-slate-700 px-1">Heights</legend>
          <p className="text-[11px] text-slate-500 mb-2">
            The single strongest predictor of how tall a child ends up.
          </p>
          <div className="space-y-3">
            <HeightFtIn
              label="Mother&rsquo;s height" ft={momFt} inches={momIn}
              onChangeFt={setMomFt} onChangeIn={setMomIn}
            />
            <HeightFtIn
              label="Father&rsquo;s height" ft={dadFt} inches={dadIn}
              onChangeFt={setDadFt} onChangeIn={setDadIn}
            />
          </div>
        </fieldset>

        <fieldset className="border border-slate-200 rounded p-3">
          <legend className="text-sm font-medium text-slate-700 px-1">
            Your own puberty (optional)
          </legend>
          <p className="text-[11px] text-slate-500 mb-2">
            When a child hits puberty is strongly inherited, and it changes how
            much growth is left at any given height. Without a bone-age X-ray
            this is the best substitute we have. Skip anything you&rsquo;re
            unsure of.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Mother&rsquo;s age at first period
              </label>
              <input
                type="number" min="8" max="18" step="0.5" value={menarche}
                onChange={(e) => setMenarche(e.target.value)} placeholder="e.g. 12.5"
                className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Average is about 12&frac12;. Earlier suggests a faster-maturing
                family, later a slower one.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Father&rsquo;s growth timing
              </label>
              <select
                value={fatherMaturation}
                onChange={(e) => setFatherMaturation(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded px-3 py-2 bg-white"
              >
                <option value="">Not sure / skip</option>
                <option value="early">Early &mdash; done growing by ~15</option>
                <option value="average">Average &mdash; done around 16&ndash;17</option>
                <option value="late">Late &mdash; still grew at 18+</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                A useful jog: did he keep getting taller after high school?
              </p>
            </div>
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !busy && (
          <p className="text-sm text-emerald-700">
            Saved. Every child&rsquo;s prediction now uses these.
          </p>
        )}
        <button
          type="submit" disabled={busy}
          className="bg-brand-600 hover:bg-brand-700 text-white rounded px-4 py-2 font-medium disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
