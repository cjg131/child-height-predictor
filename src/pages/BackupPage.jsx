// Backup and restore.
//
// Download: the full record as JSON (everything, including trashed items) and
// a CSV for Excel. Restore: pick a JSON backup and the app re-creates only the
// documents that are missing. It never overwrites anything that exists, so
// restoring an old backup can't undo newer edits.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchEverything, currentIds, applyRestore } from '../lib/children.js';
import { getFamily } from '../lib/family.js';
import { buildBackup, toCsv, backupStats, planRestore } from '../lib/backupFormat.js';

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BackupPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastExport, setLastExport] = useState(null);
  const [plan, setPlan] = useState(null);
  const [restoreResult, setRestoreResult] = useState(null);

  const exportNow = async (kind) => {
    setBusy(true);
    setError(null);
    try {
      const [children, family] = await Promise.all([fetchEverything(user.uid), getFamily(user.uid)]);
      const backup = buildBackup({ email: user.email, family, children });
      const stamp = backup.exportedAt.slice(0, 10);
      if (kind === 'json') {
        download(`height-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
      } else {
        download(`height-measurements-${stamp}.csv`, toCsv(backup), 'text/csv;charset=utf-8');
      }
      setLastExport(backupStats(backup));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setRestoreResult(null);
    setPlan(null);
    try {
      const backup = JSON.parse(await file.text());
      const p = planRestore(backup, await currentIds(user.uid));
      setPlan({ ...p, fileName: file.name });
    } catch (err) {
      setError(err.message || "Couldn't read that file.");
    }
  };

  const runRestore = async () => {
    setBusy(true);
    setError(null);
    try {
      setRestoreResult(await applyRestore(user.uid, plan));
      setPlan(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const btn = 'bg-brand-600 hover:bg-brand-700 text-white rounded px-4 py-2 font-medium disabled:opacity-50';

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-brand-600 underline">&larr; All kids</Link>
        <h2 className="text-2xl font-semibold mt-1">Backup</h2>
      </div>

      <section className="bg-white rounded-lg shadow p-4 space-y-3">
        <h3 className="text-lg font-semibold">Download a copy</h3>
        <p className="text-sm text-slate-600">
          The JSON file is the complete backup and can be restored here. The CSV opens in Excel,
          one row per measurement in both inches and centimeters. Save them somewhere outside the
          app, like Dropbox.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => exportNow('json')} className={btn}>
            Download backup (JSON)
          </button>
          <button type="button" disabled={busy} onClick={() => exportNow('csv')}
            className="bg-slate-200 hover:bg-slate-300 rounded px-4 py-2 font-medium disabled:opacity-50">
            Download for Excel (CSV)
          </button>
        </div>
        {lastExport && (
          <p className="text-sm text-emerald-700">
            Exported {lastExport.children} kid{lastExport.children === 1 ? '' : 's'} and {lastExport.measurements} measurements.
          </p>
        )}
      </section>

      <section className="bg-white rounded-lg shadow p-4 space-y-3">
        <h3 className="text-lg font-semibold">Restore from a backup</h3>
        <p className="text-sm text-slate-600">
          Only adds back kids and measurements that are missing. Anything already in the app is left
          exactly as it is.
        </p>
        <input type="file" accept="application/json,.json" onChange={onPickFile} disabled={busy}
          className="text-sm" />
        {plan && (
          <div className="text-sm bg-slate-50 border border-slate-200 rounded p-3 space-y-2">
            {plan.children.length === 0 && plan.heights.length === 0 ? (
              <p>Everything in {plan.fileName} is already in the app. Nothing to restore.</p>
            ) : (
              <>
                <p>
                  {plan.fileName} has {plan.children.length} kid{plan.children.length === 1 ? '' : 's'} and{' '}
                  {plan.heights.length} measurement{plan.heights.length === 1 ? '' : 's'} that are missing from the app.
                </p>
                <button type="button" disabled={busy} onClick={runRestore} className={btn}>
                  {busy ? 'Restoring...' : 'Restore the missing items'}
                </button>
              </>
            )}
          </div>
        )}
        {restoreResult && (
          <p className="text-sm text-emerald-700">
            Restored {restoreResult.children} kid{restoreResult.children === 1 ? '' : 's'} and {restoreResult.heights} measurement{restoreResult.heights === 1 ? '' : 's'}.
          </p>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
