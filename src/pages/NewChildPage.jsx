import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createChild } from '../lib/children.js';
import { inToCm } from '../lib/units.js';

export default function NewChildPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState('male');
  const [motherFeet, setMotherFeet] = useState('');
  const [motherIn, setMotherIn] = useState('');
  const [fatherFeet, setFatherFeet] = useState('');
  const [fatherIn, setFatherIn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const parseHeight = (feet, inches) => {
    const f = Number(feet), i = Number(inches);
    if (!Number.isFinite(f) || !Number.isFinite(i) || f + i === 0) return null;
    return inToCm(f * 12 + i);
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
        motherHeightCm: parseHeight(motherFeet, motherIn),
        fatherHeightCm: parseHeight(fatherFeet, fatherIn),
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
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <label className="block text-xs text-slate-600">Mother: ft</label>
              <input type="number" min="3" max="7" value={motherFeet}
                onChange={(e) => setMotherFeet(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Mother: in</label>
              <input type="number" min="0" max="11" value={motherIn}
                onChange={(e) => setMotherIn(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Father: ft</label>
              <input type="number" min="3" max="8" value={fatherFeet}
                onChange={(e) => setFatherFeet(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs text-slate-600">Father: in</label>
              <input type="number" min="0" max="11" value={fatherIn}
                onChange={(e) => setFatherIn(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1" />
            </div>
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
