// Trash: everything that was "deleted". Nothing is ever destroyed; items here
// are hidden from the rest of the app and can be put back with one click.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listTrash, restoreChild, restoreHeight } from '../lib/children.js';
import { formatFeetInches } from '../lib/units.js';

const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString() : '');

export default function TrashPage() {
  const { user } = useAuth();
  const [trash, setTrash] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => listTrash(user.uid).then(setTrash).catch((e) => setError(e.message));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user) load(); }, [user]);

  const restore = async (key, fn) => {
    setBusyId(key);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!trash) return <p>Loading...</p>;

  const empty = !trash.trashedChildren.length && !trash.trashedHeights.length;
  const btn = 'text-sm text-brand-600 hover:text-brand-700 underline disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div>
        <Link to="/" className="text-sm text-brand-600 underline">&larr; All kids</Link>
        <h2 className="text-2xl font-semibold mt-1">Trash</h2>
        <p className="text-sm text-slate-600">Deleted items wait here. Restoring puts them back exactly as they were.</p>
      </div>

      {empty && <p className="text-slate-600">The trash is empty.</p>}

      {trash.trashedChildren.length > 0 && (
        <section className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Kids</h3>
          <ul className="divide-y divide-slate-100">
            {trash.trashedChildren.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between">
                <span>{c.name} <span className="text-xs text-slate-500">trashed {when(c.deletedAt)}</span></span>
                <button className={btn} disabled={busyId === c.id}
                  onClick={() => restore(c.id, () => restoreChild(user.uid, c.id))}>
                  Restore with all measurements
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trash.trashedHeights.length > 0 && (
        <section className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-2">Measurements</h3>
          <ul className="divide-y divide-slate-100">
            {trash.trashedHeights.map(({ child, height }) => (
              <li key={height.id} className="py-2 flex items-center justify-between gap-2">
                <span>
                  {child.name}: {formatFeetInches(height.heightCm)} on {height.measurementDate}
                  {' '}<span className="text-xs text-slate-500">trashed {when(height.deletedAt)}</span>
                </span>
                <button className={btn} disabled={busyId === height.id}
                  onClick={() => restore(height.id, () => restoreHeight(user.uid, child.id, height.id))}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
