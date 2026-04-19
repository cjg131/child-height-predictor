import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listChildren } from '../lib/children.js';
import { ageInYears, formatHeight } from '../lib/units.js';

export default function ChildrenListPage() {
  const { user } = useAuth();
  const [children, setChildren] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    listChildren(user.uid).then(setChildren).catch((e) => setError(e.message));
  }, [user]);

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!children) return <p>Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Your kids</h2>
        <Link
          to="/children/new"
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 rounded"
        >
          Add child
        </Link>
      </div>
      {children.length === 0 ? (
        <p className="text-slate-600">No kids yet. Click "Add child" to get started.</p>
      ) : (
        <ul className="space-y-2">
          {children.map((c) => (
            <li key={c.id}>
              <Link
                to={`/children/${c.id}`}
                className="block bg-white rounded-lg shadow p-4 hover:bg-slate-50"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-sm text-slate-600">
                    {ageInYears(c.birthDate, new Date()).toFixed(1)} yrs
                  </span>
                </div>
                <div className="text-sm text-slate-500">
                  {c.sex === 'male' ? 'Boy' : 'Girl'} · born {c.birthDate}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
