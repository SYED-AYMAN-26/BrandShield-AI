import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Alert, Spinner } from '../lib/ui.jsx';

const STEPS = [
  { title: 'Add your content', body: 'Paste text, upload a PDF, DOCX or screenshot, or paste a web page address.' },
  { title: 'Check it against your brand rules', body: 'Every issue shows the exact sentence and the approved brand fact or rule behind it.' },
  { title: 'Fix it and submit for review', body: 'Correct the issues, send it to a reviewer, and the approver signs off.' },
];

const DEMO_ACCOUNTS = [
  { role: 'Creator', email: 'creator@demo.inkloom.test', desc: 'Write content and send it for review' },
  { role: 'Reviewer', email: 'reviewer@demo.inkloom.test', desc: 'Check issues and request changes' },
  { role: 'Approver', email: 'approver@demo.inkloom.test', desc: 'Give the final approval' },
  { role: 'Brand manager', email: 'brand@demo.inkloom.test', desc: 'Manage facts and guidelines' },
];

export default function Landing() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const enterDemo = async (email) => {
    setError(''); setBusy(email);
    try {
      await login(email, 'DemoPass!2026');
      navigate('/dashboard');
    } catch (e) {
      setError(e.message || 'Could not open the demo. Please try again.');
    } finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">🛡️</span>
          <span className="text-lg font-bold text-slate-900">BrandShield AI</span>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link to="/dashboard" className="btn-primary">Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/register" className="btn-primary">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">
              Brand content checking for marketing teams
            </p>
            <h1 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
              Stop publishing marketing claims that don’t match your brand facts.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              BrandShield AI reads your marketing content, compares it with the brand facts and guidelines you have approved,
              and shows every problem with the exact sentence and the approved source behind it. You stay in control: a reviewer
              and an approver sign off before anything goes live.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="btn-primary px-5 py-3 text-base">Create your workspace</Link>
              <a href="#demo" className="btn-secondary px-5 py-3 text-base">Try the demo first</a>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              No credit card. The demo workspace uses a fictional brand so you can explore freely.
            </p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">What a finding looks like</h2>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 ring-1 ring-inset ring-orange-200">High</span>
                <span className="text-xs font-medium text-slate-600">Confirmed conflict</span>
              </div>
              <p className="mt-2 text-sm text-slate-800">
                <span className="rounded bg-amber-100 px-1">“Our Pro plan is just ₹1,999 per user per month”</span>
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="font-semibold text-slate-700">Why this is a problem</dt>
                  <dd className="text-slate-600">Your text says ₹1,999, but approved brand fact “Pro plan price (monthly)” states ₹2,499 per user per month.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-700">Approved source</dt>
                  <dd className="text-slate-600">Brand Book §3 Pricing (v1) — “The approved price of the Inkloom AI Pro plan is ₹2,499 per user per month.”</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-700">Suggested fix</dt>
                  <dd className="text-slate-600">Change “₹1,999” to “₹2,499”, or ask a Brand Manager to update the approved fact.</dd>
                </div>
              </dl>
            </div>
            <p className="mt-3 text-xs text-slate-500">This is the real format the app produces for the demo brand.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-xl font-bold text-slate-900">How it works</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-600">Three steps. No training needed.</p>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-5">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-3 text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Explore the demo workspace</h2>
            <p className="mt-2 text-sm text-slate-600">
              Pick a role to see exactly what that person sees. All demo accounts use the password
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-800">DemoPass!2026</code>
              and a fictional brand called Inkloom AI.
            </p>
            {error && <div className="mt-4"><Alert tone="error" title="Could not open the demo">{error}</Alert></div>}
            <ul className="mt-4 space-y-2">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button type="button" onClick={() => enterDemo(a.email)} disabled={!!busy}
                    className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-800" aria-hidden="true">→</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{a.role}</span>
                      <span className="block truncate text-xs text-slate-500">{a.desc}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-brand-700">{busy === a.email ? <Spinner /> : 'Open'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card bg-slate-900 p-6 text-slate-100">
            <h3 className="text-sm font-semibold text-white">What the demo contains</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>• 6 approved brand facts (one deliberately expired, to show freshness warnings)</li>
              <li>• 5 approved brand guidelines, including a banned-phrase rule and a required disclosure</li>
              <li>• 1 landing-page draft with 7 real findings already detected</li>
              <li>• A full audit trail of what happened and who did it</li>
            </ul>
            <p className="mt-4 rounded-lg bg-slate-800 p-3 text-xs text-slate-300">
              Honest limits: the checker uses deterministic rules by default. External AI is optional and off unless
              an administrator configures it. The checker can miss issues, so human review is still required.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6">
        <div className="mx-auto max-w-6xl px-4 text-xs text-slate-500">
          BrandShield AI · Demo brand “Inkloom AI” is fictional · Findings are advisory and require human review.
        </div>
      </footer>
    </div>
  );
}
