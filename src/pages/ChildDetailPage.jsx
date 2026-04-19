import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getChild, listHeights, addHeight, updateHeight, deleteHeight,
  updateChild, deleteChild,
} from '../lib/children.js';
import AddHeightForm from '../components/AddHeightForm.jsx';
import GrowthChart from '../components/GrowthChart.jsx';
import PredictionPanel from '../components/PredictionPanel.jsx';
import HeightTable from '../components/HeightTable.jsx';
import ChildProfileForm from '../components/ChildProfileForm.jsx';
import { ageInYears, formatFeetInches as parentFtIn } from '../lib/units.js';

export default function ChildDetailPage() {
  const { user } = useAuth();
  const { childId } = useParams();
  const navigate = useNavigate();
  const [child, setChild] = useState(null);
  const [heights, setHeights] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [c, hs] = await Promise.all([
        getChild(user.uid, childId),
        listHeights(user.uid, childId),
      ]);
      setChild(c);
      setHeights(hs);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user && childId) reload(); /* eslint-disable-next-line */ }, [user, childId]);

  const onAddHeight = async (data) => {
    await addHeight(user.uid, childId, data);
    await reload();
  };

  const onUpdateHeight = async (id, data) => {
    await updateHeight(user.uid, childId, id, data);
    await reload();
  };

  const onDeleteHeight = async (id) => {
    if (!confirm('Delete this measurement?')) return;
    await deleteHeight(user.uid, childId, id);
    await reload();
  };

  const onSaveProfile = async (data) => {
    await updateChild(user.uid, childId, data);
    setEditingProfile(false);
    await reload();
  };

  const onDeleteChild = async () => {
    if (!confirm(`Delete ${child.name} and all their measurements? This can't be undone.`)) return;
    await deleteChild(user.uid, childId);
    navigate('/');
  };

  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (loading || !child) return <p>Loading...</p>;

  const latest = heights.length ? heights[heights.length - 1] : null;
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
          {(child.motherHeightCm != null || child.fatherHeightCm != null) && (
            <p className="text-xs text-slate-500 mt-1">
              Parents:
              {' '}mom {child.motherHeightCm != null ? parentFtIn(child.motherHeightCm) : '—'}
              {' · '}dad {child.fatherHeightCm != null ? parentFtIn(child.fatherHeightCm) : '—'}
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
            Delete child
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
        <GrowthChart child={child} heights={heights} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Add measurement</h3>
          <AddHeightForm onAdd={onAddHeight} />
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">Adult height prediction</h3>
          <PredictionPanel child={child} latest={latest} />
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-2">All measurements ({heights.length})</h3>
        <HeightTable heights={heights} child={child} onUpdate={onUpdateHeight} onDelete={onDeleteHeight} />
      </section>
    </div>
  );
}
