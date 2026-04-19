import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createChild } from '../lib/children.js';
import { inToCm, formatFeetInchesPrecise } from '../lib/units.js';

// Convert ft + in fields to total inches. Blank ft counts as 0 so the user
// can type just inches if they want.
function ftInToInches(ft, inches) {
  const f = Number(ft) || 0;
  const i = Number(inches) || 0;
  if (f <= 0 && i <= 0) return null;
  return f * 12 + i;
}

function ParentHeight({ label, ft, inches, onChangeFt, onChangeIn }) {
  const preview = useMemo(() => {
    const total = ftInToInches(ft, inches);
    if (total == null || total <= 0) return null;
    const cm = inToCm(total);
    return formatFeetInchesPrecise(cm);
  }, [ft, inches]);

  return (
    <div>
      <label className="block text-xs text-slate-600">{label}</label>
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
      {preview && <p className="text-[11px] text-slate-500 mt-0.5">= {preview}</p>}
    </div>
  );
}

export default function NewChildPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState('male');
  const [motherFt, setMotherFt] = useState('');
  const [motherIn, setMotherIn] = useState('');
  const [fatherFt, setFatherFt] = useState('');
  const [fatherIn, setFatherIn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const parseHeight = (ft, inches) => {
    const total = ftInToInches(ft, inches);
    if (total == null || total <= 0) return null;
    return inToCm(total);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const id = await createChild(user.uid, {
        name,
        birthDate,
        sex,
        motherHeightCm: parseHeight(motherFt, motherIn),
        fatherHeightCm: parseHeight(fatherFt, fatherIn),
      });
      navigate(`/children/${id}`);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Add a child</h2>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Birthday</label>
          <input
            type="date" required value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Sex (for growth charts)</label>
          <select
            value={sex} onChange={(e) => setSex(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 bg-white"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <fieldset className="border border-slate-200 rounded p-3">
          <legend className="text-sm font-medium text-slate-700 px-1">
            Parent heights (optional, improves predictions)
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
            <ParentHeight
              label="Mother"
              ft={motherFt} inches={motherIn}
              onChangeFt={setMotherFt} onChangeIn={setMotherIn}
            />
            <ParentHeight
              label="Father"
              ft={fatherFt} inches={fatherIn}
              onChangeFt={setFatherFt} onChangeIn={setFatherIn}
            />
          </div>
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded px-4 py-2 font-medium disabled:opacity-50">
            {busy ? '...' : 'Save'}
          </button>
          <button type="button" onClick={() => navigate('/')}
            className="bg-slate-200 hover:bg-slate-300 rounded px-4 py-2">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
