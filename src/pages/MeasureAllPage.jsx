// Measure everyone at once: one date, one row per kid, one Save.
//
// Each row shows the kid's last reading so a typo stands out before it is
// saved, and every filled row runs through the same checks as the single
// Add measurement form. Rows left blank are skipped; nothing existing is
// changed, this page only adds.

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listChildrenWithHeights, addHeight } from '../lib/children.js';
import { checkNewMeasurement } from '../lib/dataQuality.js';
import {
  inToCm, lbOzToKg, formatFeetInchesPrecise, kgToLb, localDateIso,
} from '../lib/units.js';
import { sortByDate } from '../lib/predict.js';

const EMPTY_ROW = { ft: '', inches: '', lb: '', oz: '', shoe: '', tanner: '', note: '' };

function rowHeightCm(r) {
  const total = (Number(r.ft) || 0) * 12 + (Number(r.inches) || 0);
  return total > 0 ? inToCm(total) : null;
}

export default function MeasureAllPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kids, setKids] = useState(null);
  const [date, setDate] = useState(localDateIso());
  const [rows, setRows] = useState({});
  const [reviewed, setReviewed] = useState(null); // signature of the reviewed form
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedCount, setSavedCount] = useState(null);

  useEffect(() => {
    if (!user) return;
    listChildrenWithHeights(user.uid)
      .then((ks) => {
        setKids(ks);
        setRows(Object.fromEntries(ks.map((k) => [k.id, { ...EMPTY_ROW }])));
      })
      .catch((e) => setError(e.message));
  }, [user]);

  const setField = (id, field, value) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setSavedCount(null);
  };

  const filled = useMemo(
    () => (kids || []).filter((k) => rowHeightCm(rows[k.id] || EMPTY_ROW) != null),
    [kids, rows],
  );

  const issuesByKid = useMemo(() => {
    const out = {};
    for (const k of filled) {
      out[k.id] = checkNewMeasurement({
        child: k, existing: k.heights, measurementDate: date, heightCm: rowHeightCm(rows[k.id]),
      });
    }
    return out;
  }, [filled, rows, date]);

  const signature = JSON.stringify({ date, rows });
  const anyBlock = Object.values(issuesByKid).some((l) => l.some((i) => i.level === 'block'));
  const anyWarn = Object.values(issuesByKid).some((l) => l.length > 0);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (!filled.length) { setError('Enter at least one height.'); return; }
    if (anyBlock) { setError('Fix the rows marked in red first.'); return; }
    if (anyWarn && reviewed !== signature) { setReviewed(signature); return; }

    setBusy(true);
    let n = 0;
    try {
      for (const k of filled) {
        const r = rows[k.id];
        await addHeight(user.uid, k.id, {
          measurementDate: date,
          heightCm: rowHeightCm(r),
          weightKg: lbOzToKg(r.lb, r.oz),
          tannerStage: r.tanner ? Number(r.tanner) : null,
          shoeSizeUs: r.shoe !== '' ? Number(r.shoe) : null,
          boneAgeYears: null,
          note: r.note || null,
        });
        n++;
      }
      setSavedCount(n);
      const ks = await listChildrenWithHeights(user.uid);
      setKids(ks);
      setRows(Object.fromEntries(ks.map((k) => [k.id, { ...EMPTY_ROW }])));
      setReviewed(null);
    } catch (err) {
      setError(`Saved ${n} of ${filled.length}. ${err.message || 'Save failed'}`);
    } finally {
      setBusy(false);
    }
  };

  if (error && !kids) return <p className="text-red-600">Error: {error}</p>;
  if (!kids) return <p>Loading...</p>;
  if (!kids.length) {
    return <p className="text-slate-600">No kids yet. <Link to="/children/new" className="underline text-brand-600">Add one</Link> first.</p>;
  }

  const input = 'w-full border border-slate-300 rounded px-2 py-1.5';

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Link to="/" className="text-sm text-brand-600 underline">&larr; All kids</Link>
        <h2 className="text-2xl font-semibold mt-1">Measure everyone</h2>
        <p className="text-sm text-slate-600">
          One date for everyone. Leave a kid blank to skip them. Best practice: morning, no shoes,
          heels against the wall, a book flat on the head.
        </p>
      </div>

      <div className="max-w-xs">
        <label className="block text-sm font-medium text-slate-700">Date measured</label>
        <input type="date" required value={date}
          onChange={(e) => { setDate(e.target.value); setSavedCount(null); }}
          className={`mt-1 ${input}`} />
      </div>

      <div className="space-y-3">
        {kids.map((k) => {
          const r = rows[k.id] || EMPTY_ROW;
          const last = sortByDate(k.heights).pop();
          const cm = rowHeightCm(r);
          const issues = issuesByKid[k.id] || [];
          const changeIn = cm != null && last ? (cm - last.heightCm) / 2.54 : null;
          return (
            <div key={k.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-lg">{k.name}</h3>
                <span className="text-xs text-slate-500">
                  {last
                    ? <>Last: {formatFeetInchesPrecise(last.heightCm)} on {last.measurementDate}
                        {last.weightKg ? `, ${kgToLb(last.weightKg).toFixed(0)} lb` : ''}
                        {last.shoeSizeUs != null ? `, shoe ${last.shoeSizeUs}` : ''}</>
                    : 'No measurements yet'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-2">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-600">Height</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" max="7" step="1" placeholder="ft" value={r.ft}
                      onChange={(e) => setField(k.id, 'ft', e.target.value)} className={input} />
                    <input type="number" min="0" max="11.75" step="0.25" placeholder="in" value={r.inches}
                      onChange={(e) => setField(k.id, 'inches', e.target.value)} className={input} />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-600">Weight (optional)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" max="500" step="1" placeholder="lb" value={r.lb}
                      onChange={(e) => setField(k.id, 'lb', e.target.value)} className={input} />
                    <input type="number" min="0" max="15.9" step="0.1" placeholder="oz" value={r.oz}
                      onChange={(e) => setField(k.id, 'oz', e.target.value)} className={input} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600">Shoe (US)</label>
                  <input type="number" min="0" max="20" step="0.5" value={r.shoe}
                    onChange={(e) => setField(k.id, 'shoe', e.target.value)} className={input} />
                </div>
                <div>
                  <label className="block text-xs text-slate-600">Tanner</label>
                  <select value={r.tanner} onChange={(e) => setField(k.id, 'tanner', e.target.value)}
                    className={`${input} bg-white`}>
                    <option value="">&mdash;</option>
                    {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-6">
                  <input placeholder="Note (optional)" value={r.note}
                    onChange={(e) => setField(k.id, 'note', e.target.value)} className={input} />
                </div>
              </div>
              {cm != null && (
                <p className="text-xs text-slate-500 mt-1">
                  = {formatFeetInchesPrecise(cm)}
                  {changeIn != null && ` (${changeIn >= 0 ? '+' : ''}${changeIn.toFixed(2)} in since last)`}
                </p>
              )}
              {issues.length > 0 && (
                <ul className={`mt-2 text-sm list-disc pl-5 ${issues.some((i) => i.level === 'block') ? 'text-red-700' : 'text-amber-800'}`}>
                  {issues.map((i, n) => <li key={n}>{i.message}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {reviewed === signature && anyWarn && !anyBlock && (
        <p className="text-sm text-amber-800">Check the notes above, then click Save again to keep the numbers as entered.</p>
      )}
      {savedCount != null && (
        <p className="text-sm text-emerald-700">
          Saved {savedCount} measurement{savedCount === 1 ? '' : 's'}.{' '}
          <button type="button" onClick={() => navigate('/')} className="underline">See everyone</button>
        </p>
      )}
      <button type="submit" disabled={busy || !filled.length}
        className="bg-brand-600 hover:bg-brand-700 text-white rounded px-4 py-2 font-medium disabled:opacity-50">
        {busy ? 'Saving...'
          : reviewed === signature && anyWarn ? `Save anyway (${filled.length})`
            : `Save ${filled.length || ''} measurement${filled.length === 1 ? '' : 's'}`}
      </button>
    </form>
  );
}
