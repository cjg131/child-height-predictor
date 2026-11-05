// Lists entries that look like typos or rounding. Read-only: it never changes
// data, it only points at rows worth a second look.

import React, { useState } from 'react';

export default function DataQualityPanel({ flags, title = 'Worth a second look' }) {
  const [open, setOpen] = useState(false);
  if (!flags || !flags.length) return null;
  return (
    <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left">
        <span className="font-medium text-amber-900">
          {title} ({flags.length})
        </span>
        <span className="text-sm text-amber-800 underline">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          <ul className="mt-2 space-y-1 text-sm text-amber-900 list-disc pl-5">
            {flags.map((f, i) => <li key={i}>{f.message}</li>)}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Nothing here was changed. If a reading is wrong, fix it with &ldquo;edit&rdquo; in the
            measurements table. Bad readings move the prediction more than anything else.
          </p>
        </>
      )}
    </section>
  );
}
