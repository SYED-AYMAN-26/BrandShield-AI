import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Spinner } from '../lib/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setErrors({});
    if (!form.email.trim()) return setErrors({ email: 'Enter your email address.' });
    if (!form.password) return setErrors({ password: 'Enter your password.' });
    setBusy(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(location.state?.from || '/dashboard');
    } catch (err) {
      setError(err.message || 'Could not sign you in.');
      if (err.details) setErrors(err.details);
    } finally { setBusy(false); }
  };

  const fillDemo = (email) => setForm({ email, password: 'DemoPass!2026' });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">🛡️</span>
          <span className="text-lg font-bold text-slate-900">BrandShield AI</span>
        </Link>

        <div className="card p-6">
          <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Welcome back. Sign in to check and review your content.</p>

          {error && <div className="mt-4"><Alert tone="error" title="Sign-in failed">{error}</Alert></div>}

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input id="email" type="email" autoComplete="email" className="input" placeholder="you@company.com"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />
              {errors.email && <p id="email-error" className="field-error">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" autoComplete="current-password" className="input" placeholder="Your password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} />
              {errors.password && <p id="password-error" className="field-error">{errors.password}</p>}
            </div>
            <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
              {busy ? <><Spinner /> Signing in…</> : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-600">
            No account? <Link to="/register" className="link">Create a workspace</Link>
          </p>
        </div>

        <div className="card mt-4 p-4">
          <p className="text-xs font-semibold text-slate-700">Demo accounts (password DemoPass!2026)</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ['Creator', 'creator@demo.inkloom.test'],
              ['Reviewer', 'reviewer@demo.inkloom.test'],
              ['Approver', 'approver@demo.inkloom.test'],
              ['Brand manager', 'brand@demo.inkloom.test'],
            ].map(([label, email]) => (
              <button key={email} type="button" onClick={() => fillDemo(email)} className="btn-secondary justify-start px-3 py-2 text-xs">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
