import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signIn');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signIn') await signIn(email, password);
      else await signUp(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto bg-white rounded-lg shadow p-6 mt-8">
      <h1 className="text-xl font-semibold mb-4">
        {mode === 'signIn' ? 'Sign in' : 'Create an account'}
      </h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password" required minLength={6} value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {busy ? '...' : (mode === 'signIn' ? 'Sign in' : 'Create account')}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        className="mt-4 w-full text-sm text-brand-600 underline"
      >
        {mode === 'signIn' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
