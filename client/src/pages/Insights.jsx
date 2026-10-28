import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Loading, Spinner, Modal, fmtDate, fmtDateTime } from '../lib/ui.jsx';

const TABS = [
  { key: 'freshness', label: 'Fact freshness', help: 'Which approved facts are expired or overdue for review.' },
  { key: 'ambiguity', label: 'Unclear guidelines', help: 'Rules that reviewers and the checker keep disagreeing about.' },
  { key: 'evaluation', label: 'Accuracy check', help: 'How well the checker performs on a labelled test set.' },
];

export default function Insights() {
  const { user } = useAuth();
  const [tab, setTab] = useState('freshness');
  const isManager = user.role === 'brand_manager';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Insights</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Everything here is calculated from records stored in <strong>this</strong> workspace. Where there is not enough data,
          we say so instead of guessing.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{TABS.find((t) => t.key === tab)?.help}</p>

      {tab === 'freshness' && <Freshness />}
      {tab === 'ambiguity' && <Ambiguity isManager={isManager} />}
      {tab === 'evaluation' && <Evaluation isManager={isManager} />}
    </div>
  );
}

/* ------------------------------- Freshness ------------------------------- */
function Freshness() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/insights/freshness').then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <Alert tone="error" title="Could not load freshness">{error}</Alert>;
  if (!data) return <Loading label="Checking fact dates…" />;

  const buckets = [
    { key: 'expired', label: 'Expired', tone: 'rose', help: 'The approved fact is past its expiry date. Checks will not treat it as reliable.' },
    { key: 'expiring', label: 'Expiring within 30 days', tone: 'amber', help: 'Refresh these before the date passes.' },
    { key: 'overdue_review', label: 'Overdue for review', tone: 'orange', help: 'Past the review date. Confirm the fact is still accurate.' },
    { key: 'ok', label: 'Current', tone: 'emerald', help: 'Within date.' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((b) => (
          <div key={b.key} className="card p-4">
            <p className="text-xs font-medium text-slate-500">{b.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{(data.counts.facts[b.key] || 0) + (data.counts.guidelines[b.key] || 0)}</p>
            <p className="mt-1 text-[11px] text-slate-500">{b.help}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Approved facts</h2>
          <p className="text-xs text-slate-500">Calculated from stored expiry and review dates on {fmtDateTime(data.checkedAt)}</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {data.facts.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{f.label} <span className="font-mono text-[11px] text-slate-500">v{f.version}</span></p>
                <p className="text-xs text-slate-500">
                  {f.freshness.expiresAt ? `Expires ${fmtDate(f.freshness.expiresAt)}` : 'No expiry date'} · {f.freshness.reviewBy ? `Review by ${fmtDate(f.freshness.reviewBy)}` : 'No review date'}
                </p>
              </div>
              <FreshnessPill f={f.freshness} />
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Guidelines</h2></div>
        <ul className="divide-y divide-slate-100">
          {data.guidelines.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{g.code} — {g.title} <span className="font-mono text-[11px] text-slate-500">v{g.version}</span></p>
              </div>
              <FreshnessPill f={g.freshness} />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-500">{data.note}</p>
    </div>
  );
}

function FreshnessPill({ f }) {
  const styles = {
    ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    expiring: 'bg-amber-50 text-amber-900 ring-amber-200',
    expired: 'bg-rose-50 text-rose-800 ring-rose-200',
    overdue_review: 'bg-orange-50 text-orange-900 ring-orange-200',
  };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${styles[f.status]}`}>{f.label}</span>;
}

/* ------------------------------- Ambiguity ------------------------------- */
function Ambiguity({ isManager }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [decide, setDecide] = useState(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');

  const load = () => api.get('/insights/ambiguity').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (action) => {
    setBusy(true);
    try {
      await api.post(`/insights/ambiguity/${decide.savedId}/decide`, { action, finalText: text, note: 'Reviewed in Insights' });
      setDecide(null); setNotice(`Proposal ${action}. ${action === 'rejected' ? 'The guideline is unchanged.' : 'A new guideline version was created.'}`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (error) return <Alert tone="error" title="Could not load guideline analysis">{error}</Alert>;
  if (!data) return <Loading label="Analysing guidelines…" />;

  return (
    <div className="space-y-4">
      {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
      <Alert tone="info" title="How this works">{data.method}</Alert>

      <ul className="space-y-3">
        {data.analyses.map((a) => (
          <li key={a.code} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{a.code}</span>
                  <h3 className="text-sm font-semibold text-slate-900">{a.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.flagged ? 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200' : 'bg-slate-100 text-slate-600'}`}>
                    {a.flagged ? 'Possibly unclear' : 'No ambiguity detected'}
                  </span>
                  <span className="text-[11px] text-slate-500">score {a.score}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{a.currentText}</p>
              </div>
              {isManager && a.flagged && a.savedId && (
                <button className="btn-secondary shrink-0 px-3 py-1.5 text-xs" onClick={() => { setDecide(a); setText(a.proposedText); }}>Review proposal</button>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it looks unclear</h4>
                <ul className="mt-1 space-y-1">
                  {a.signals.map((s, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <strong className="text-slate-800">{s.label}:</strong> {s.detail}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Real review decisions</h4>
                {a.stats.totalDecisions === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No reviewer has accepted or dismissed a finding from this rule yet, so there is nothing to analyse.</p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-slate-600">
                      {a.stats.acceptances} accepted · {a.stats.dismissals} dismissed ({Math.round(a.stats.dismissRate * 100)}% dismissal rate)
                    </p>
                    <ul className="mt-1 space-y-1">
                      {a.decisionEvidence.map((d, i) => (
                        <li key={i} className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">“{d.reason}”</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Modal open={!!decide} onClose={() => setDecide(null)} title={`Review proposal for ${decide?.code}`}
        footer={<>
          <button className="btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => submit('rejected')}>Reject proposal</button>
          <button className="btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => submit('accepted')}>Accept suggested wording</button>
          <button className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => submit('edited')}>
            {busy ? <><Spinner /> Saving…</> : 'Save my edited wording'}
          </button>
        </>}>
        <p className="text-sm text-slate-600">Edit the wording below. Saving creates a new version of the guideline and keeps the old one in its history.</p>
        <textarea className="input mt-2 font-mono text-xs" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      </Modal>
    </div>
  );
}

/* ------------------------------- Evaluation ------------------------------- */
function Evaluation() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showExamples, setShowExamples] = useState(false);
  useEffect(() => { api.get('/evaluation').then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <Alert tone="error" title="Could not load evaluation">{error}</Alert>;
  if (!data) return <Loading label="Scoring the checker…" />;

  const m = data.results.all.metrics;
  const b2 = data.results.batch2.metrics;

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Read this before the numbers">
        <p>{data.limitations[0]}</p>
        <p className="mt-1">The checker currently runs in <strong>{data.aiMode.mode}</strong> mode ({data.aiMode.reason})</p>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Precision" value={m.precision} hint={data.interpretation.precision} />
        <Metric label="Recall" value={m.recall} hint={data.interpretation.recall} />
        <Metric label="False alarms on clean text" value={m.falseAlarmRateOnClean} hint={data.interpretation.falseAlarmRateOnClean} />
        <Metric label="Examples scored" value={data.results.all.examples} hint={`${data.results.all.holdoutExamples} written after the rules were frozen`} raw />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-900">Held-out batch (most trustworthy)</h2>
        <p className="mt-1 text-xs text-slate-500">
          {data.results.batch2.examples} examples written after the rules were finalised, run without further tuning.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <p className="text-sm text-slate-700">Precision <strong>{b2.precision}</strong></p>
          <p className="text-sm text-slate-700">Recall <strong>{b2.recall}</strong></p>
          <p className="text-sm text-slate-700">Missed issues <strong>{b2.missedTotal}</strong></p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Accuracy by issue type</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2">Issue type</th><th className="px-4 py-2">Found</th><th className="px-4 py-2">Wrong</th><th className="px-4 py-2">Missed</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(data.results.all.byFamily).map(([k, v]) => (
              <tr key={k}>
                <td className="px-4 py-2 text-slate-800">{v.label}</td>
                <td className="px-4 py-2 text-emerald-700">{v.tp}</td>
                <td className="px-4 py-2 text-rose-700">{v.fp}</td>
                <td className="px-4 py-2 text-amber-700">{v.fn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-900">Limitations of this evaluation</h2>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {data.limitations.map((l, i) => <li key={i}>• {l}</li>)}
        </ul>
      </div>

      <button className="btn-secondary" onClick={() => setShowExamples((v) => !v)}>{showExamples ? 'Hide' : 'Show'} every scored example</button>
      {showExamples && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Example</th><th className="px-3 py-2">Expected</th><th className="px-3 py-2">Found</th><th className="px-3 py-2">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.results.all.perExample.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{p.id}{p.batch === 2 ? ' (held-out)' : ''}</td>
                  <td className="px-3 py-2 text-slate-600">{p.expected.join(', ') || 'clean'}</td>
                  <td className="px-3 py-2 text-slate-600">{p.predicted.join(', ') || 'none'}</td>
                  <td className="px-3 py-2">{p.exactMatch ? <span className="text-emerald-700">correct</span> : <span className="text-rose-700">wrong</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, hint, raw }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value === null || value === undefined ? '—' : raw ? value : `${Math.round(value * 100)}%`}</p>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}
