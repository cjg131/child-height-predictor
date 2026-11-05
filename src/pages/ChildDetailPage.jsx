import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getChild, listHeights, addHeight, updateHeight, trashHeight,
  updateChild, trashChild,
} from '../lib/children.js';
import AddHeightForm from '../components/AddHeightForm.jsx';
import GrowthChart from '../components/GrowthChart.jsx';
import PredictionPanel from '../components/PredictionPanel.jsx';
import HeightTable from '../components/HeightTable.jsx';
import ChildProfileForm from '../components/ChildProfileForm.jsx';
import PredictionHistoryChart from '../components/PredictionHistoryChart.jsx';
import DataQualityPanel from '../components/DataQualityPanel.jsx';
import { predictForChild, projectionPath } from '../lib/predict.js';
import { auditChild } from '../lib/dataQuality.js';
import { getFamily, resolveParentData } from '../lib/family.js';
import { ageInYears, formatFeetInches as parentFtIn } from '../lib/units.js';

export default function ChildDetailPage() {
  const { user } = useAuth();
  const { childId } = useParams();
  const navigate = useNavigate();
  const [child, setChild] = useState(null);
  const [family, setFamily] = useState(null);
  const [heights, setHeights] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [c, hs, fam] = await Promise.all([
        getChild(user.uid, childId),
        listHeights(user.uid, childId),
        getFamily(user.uid),
      ]);
      setChild(c);
      setHeights(hs);
      setFamily(fam);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // `reload` is intentionally omitted: it is redefined on every render, so
  // including it would refetch in a loop. Refetching on user/childId is the
  // actual intent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user && childId) reload(); }, [user, childId]);

  const onAddHeight = async (data) => {
    await addHeight(user.uid, childId, data);
    await reload();
  };

  const onUpdateHeight = async (id, data) => {
    await updateHeight(user.uid, childId, id, data);
    await reload();
  };

  const onDeleteHeight = async (id) => {
    if (!confirm('Move this measurement to the trash? You can restore it from the Trash page.')) return;
    await trashHeight(user.uid, childId, id);
    await reload();
  };

  const onSaveProfile = async (data) => {
    await updateChild(user.uid, childId, data);
    setEditingProfile(false);
    await reload();
  };

  const onDeleteChild = async () => {
    if (!confirm(`Move ${child.name} to the trash? Their measurements are kept, and you can restore everything from the Trash page.`)) return;
    await trashChild(user.uid, childId);
    navigate('/');
  };

  // Family record wins field-by-field; children saved before the Parents page
  // existed still carry their own copies, which are used as the fallback.
  const resolvedChild = useMemo(
    () => (child ? { ...child, ...resolveParentData(family, child) } : null),
    [child, family],
  );
  const projection = useMemo(() => {
    if (!resolvedChild || !heights.length) return null;
    const p = predictForChild(resolvedChild, heights);
    return projectionPath({
      sex: resolvedChild.sex,
      birthDate: resolvedChild.birthDate,
      latest: heights[heights.length - 1],
      consensus: p?.consensus,
    });
  }, [resolvedChild, heights]);
  const flags = useMemo(() => (child ? auditChild(child, heights) : []), [child, heights]);

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (loading || !child) return <p>Loading...</p>;
  if (child.deletedAt) {
    return (
      <p className="text-slate-600">
        {child.name} is in the trash. <Link to="/trash" className="text-brand-600 underline">Restore from Trash</Link>
      </p>
    );
  }

  const latest = heights.length ? heights[heights.length - 1] : null;
  const parents = resolveParentData(family, child);
  const ageY = ageInYears(child.birthDate, new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-brand-600 underline">&larr; All kids</Link>
          <h2 className="text-2xl font-semibold mt-1">{child.name}</h2>
          <p className="text-sm text-slate-600">
            {child.sex === 'male' ? 'Boy' : 'Girl'} · born {child.birthDate} · {ageY.toFixed(1)} years old
          </p>
          {(parents.motherHeightCm != null || parents.fatherHeightCm != null) && (
            <p className="text-xs text-slate-500 mt-1">
              Parents:
              {' '}mom {parents.motherHeightCm != null ? parentFtIn(parents.motherHeightCm) : '—'}
              {' · '}dad {parents.fatherHeightCm != null ? parentFtIn(parents.fatherHeightCm) : '—'}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end">
          <button onClick={() => setEditingProfile((v) => !v)}
            className="text-sm text-brand-600 hover:text-brand-700 underline">
            {editingProfile ? 'Close' : 'Edit profile'}
          </button>
          <button onClick={onDeleteChild}
            className="text-sm text-red-600 hover:text-red-700 underline">
            Move to trash
          </button>
        </div>
      </div>
      {editingProfile && (
        <section className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Edit profile</h3>
          <ChildProfileForm
            initial={child}
            submitLabel="Save changes"
            onSubmit={onSaveProfile}
            onCancel={() => setEditingProfile(false)}
          />
        </section>
      )}

      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-2">Growth chart</h3>
        <GrowthChart child={child} heights={heights} projection={projection} />
        {projection && (
          <p className="text-xs text-slate-500 mt-2">
            Dashed line: projected path to age 20. Shaded red: the 95% range, which widens toward adulthood.
          </p>
        )}
      </section>

      <DataQualityPanel flags={flags} />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Add measurement</h3>
          <AddHeightForm onAdd={onAddHeight} child={child} existing={heights} />
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Adult height prediction</h3>
          <PredictionPanel
            child={resolvedChild}
            latest={latest}
            heights={heights}
          />
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-2">How the prediction has changed</h3>
        <PredictionHistoryChart child={resolvedChild} heights={heights} />
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-2">All measurements ({heights.length})</h3>
        <HeightTable heights={heights} child={child} onUpdate={onUpdateHeight} onDelete={onDeleteHeight} />
      </section>
    </div>
  );
}
