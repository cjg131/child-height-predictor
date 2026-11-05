import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listChildrenWithHeights } from '../lib/children.js';
import { getFamily, resolveParentData } from '../lib/family.js';
import { ageInYears, formatFeetInches } from '../lib/units.js';
import { predictForChild, sortByDate } from '../lib/predict.js';
import { cdcStatureZ } from '../predictions/cdcPercentile.js';
import { auditChild, auditFamily } from '../lib/dataQuality.js';
import FamilyGrowthChart from '../components/FamilyGrowthChart.jsx';
import DataQualityPanel from '../components/DataQualityPanel.jsx';

// How often to measure. Around puberty growth changes fast and the app needs
// frequent points to tell whether the growth spurt has peaked.
function measureEveryDays(ageY) {
  return ageY >= 10 && ageY < 16 ? 90 : 180;
}

function KidCard({ kid, family }) {
  const summary = useMemo(() => {
    const resolved = { ...kid, ...resolveParentData(family, kid) };
    const sorted = sortByDate(kid.heights);
    const latest = sorted[sorted.length - 1] || null;
    const ageNow = ageInYears(kid.birthDate, new Date());
    const p = predictForChild(resolved, sorted);
    const z = latest
      ? cdcStatureZ({ sex: kid.sex, birthDate: kid.birthDate, measurementDate: latest.measurementDate, heightCm: latest.heightCm })
      : null;
    const daysSince = latest ? Math.floor((Date.now() - new Date(latest.measurementDate)) / 86400000) : null;
    return { latest, ageNow, consensus: p?.consensus, z, daysSince, due: daysSince != null && daysSince > measureEveryDays(ageNow) };
  }, [kid, family]);

  const { latest, ageNow, consensus, z, daysSince, due } = summary;
  return (
    <Link to={`/children/${kid.id}`} className="block bg-white rounded-lg shadow p-4 hover:bg-slate-50">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-lg">{kid.name}</span>
        <span className="text-sm text-slate-600">{ageNow.toFixed(1)} yrs</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Now</p>
          <p className="font-medium">{latest ? formatFeetInches(latest.heightCm) : '—'}</p>
          {z && <p className="text-xs text-slate-500">{z.percentile.toFixed(0)}th percentile</p>}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Predicted adult</p>
          <p className="font-medium text-brand-700">{consensus ? formatFeetInches(consensus.predictedAdultHeightCm) : '—'}</p>
          {consensus && (
            <p className="text-xs text-slate-500">
              {formatFeetInches(consensus.rangeLowCm)} to {formatFeetInches(consensus.rangeHighCm)}
            </p>
          )}
        </div>
      </div>
      <p className={`text-xs mt-2 ${due ? 'text-amber-700' : 'text-slate-500'}`}>
        {latest
          ? `Last measured ${latest.measurementDate} (${daysSince} days ago)${due ? ', due for a new one' : ''}`
          : 'No measurements yet'}
      </p>
    </Link>
  );
}

export default function ChildrenListPage() {
  const { user } = useAuth();
  const [kids, setKids] = useState(null);
  const [family, setFamily] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([listChildrenWithHeights(user.uid), getFamily(user.uid)])
      .then(([ks, fam]) => { setKids(ks); setFamily(fam); })
      .catch((e) => setError(e.message));
  }, [user]);

  const flags = useMemo(() => {
    if (!kids) return [];
    const out = auditFamily(kids, family).map((f) => ({ message: f.message }));
    for (const k of kids) {
      for (const f of auditChild(k, k.heights)) out.push({ message: `${k.name}: ${f.message}` });
    }
    return out;
  }, [kids, family]);

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!kids) return <p>Loading...</p>;

  const link = 'text-sm text-brand-600 hover:text-brand-700 underline';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Your kids</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/parents" className={link}>Parents</Link>
          <Link to="/backup" className={link}>Backup</Link>
          <Link to="/trash" className={link}>Trash</Link>
          <Link to="/children/new" className={link}>Add child</Link>
          {kids.length > 0 && (
            <Link to="/measure"
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 rounded">
              Measure everyone
            </Link>
          )}
        </div>
      </div>

      {kids.length === 0 ? (
        <p className="text-slate-600">No kids yet. Click &ldquo;Add child&rdquo; to get started.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {kids.map((k) => <KidCard key={k.id} kid={k} family={family} />)}
          </div>
          <DataQualityPanel flags={flags} />
          <section className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold mb-2">Everyone together</h3>
            <FamilyGrowthChart kids={kids} />
          </section>
        </>
      )}
    </div>
  );
}
