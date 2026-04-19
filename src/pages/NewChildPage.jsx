import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createChild } from '../lib/children.js';
import ChildProfileForm from '../components/ChildProfileForm.jsx';

export default function NewChildPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCreate = async (data) => {
    const id = await createChild(user.uid, data);
    navigate(`/children/${id}`);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Add a child</h2>
      <ChildProfileForm
        submitLabel="Save"
        onSubmit={handleCreate}
        onCancel={() => navigate('/')}
      />
    </div>
  );
}
