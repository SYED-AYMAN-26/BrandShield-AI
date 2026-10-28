import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Spinner } from '../lib/ui.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', orgName: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setErrors({});
    const local = {};
    if (form.name.trim().length < 2) local.name = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) local.email = 'Enter a valid email address.';
    if (form.password.length < 10) local.password = 'Use at least 10 characters.';
    if (form.orgName.trim().length < 2) local.orgName = 'Enter your company or team name.';
    if (Object.keys(local).length) return setErrors(local);

    setBusy(true);
    try { await register(form); navigate('/dashboard'); }
    catch (err) { setError(err.message); if (err.details) setErrors(err.details); }
    finally { setBusy(false); }
  };

  const fields = [
    { id: 'name', label: 'Your name', type: 'text', autoComplete: 'name', placeholder: 'Priya Raghavan', help: 'Shown on reviews and approvals.' },
    { id: 'email', label: 'Work email', type: 'email', autoComplete: 'email', placeholder: 'you@company.com', help: 'You will use this to sign in.' },
    { id: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', placeholder: 'At least 10 characters', help: 'Use at least 10 characters.' },
    { id: 'orgName', label: 'Company or team name', type: 'text', autoComplete: 'organization', placeholder: 'Inkloom AI', help: 'Your workspace is private to this team.' },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">🛡️</span>
          <span className="text-lg font-bold text-slate-900">BrandShield AI</span>
        </Link>
        <div className="card p-6">
          <h1 className="text-xl font-bold text-slate-900">Create your workspace</h1>
          <p className="mt-1 text-sm text-slate-600">You will be the Brand manager, so you can add brand facts and invite reviewers.</p>

          {error && <div className="mt-4"><Alert tone="error" title="Could not create your workspace">{error}</Alert></div>}

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {fields.map((f) => (
              <div key={f.id}>
                <label htmlFor={f.id} className="label">{f.label}</label>
                <input id={f.id} type={f.type} autoComplete={f.autoComplete} className="input" placeholder={f.placeholder}
                  value={form[f.id]} onChange={(e) => setForm({ ...form, [f.id]: e.target.value })}
                  aria-invalid={!!errors[f.id]} aria-describedby={`${f.id}-help${errors[f.id] ? ` ${f.id}-error` : ''}`} />
                <p id={`${f.id}-help`} className="help">{f.help}</p>
                {errors[f.id] && <p id={`${f.id}-error`} className="field-error">{errors[f.id]}</p>}
              </div>
            ))}
            <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
              {busy ? <><Spinner /> Creating…</> : 'Create workspace'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600">
            Already have an account? <Link to="/login" className="link">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
