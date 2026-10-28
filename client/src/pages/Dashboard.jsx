import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Loading, StatusBadge, SeverityBadge, EmptyState, fmtDateTime, StepList } from '../lib/ui.jsx';

const NEXT_ACTION = {
  creator: { label: 'Start a new content check', to: '/content/new' },
  reviewer: { label: 'See content waiting for review', to: '/content?status=in_review' },
  approver: { label: 'See content waiting for approval', to: '/content?status=in_review' },
  brand_manager: { label: 'Start a new content check', to: '/content/new' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading label="Loading your dashboard…" />;
  if (error) return <Alert tone="error" title="Could not load your dashboard">{error}</Alert>;

  const next = NEXT_ACTION[user.role] || NEXT_ACTION.creator;
  const t = data.totals;
  const needsAttention = data.freshness.facts.expired + data.freshness.facts.expiring + data.freshness.facts.overdue_review;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hello, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {data.pendingForMe > 0
              ? `You have ${data.pendingForMe} item${data.pendingForMe === 1 ? '' : 's'} waiting for you.`
              : 'Nothing is waiting for you right now.'}
          </p>
        </div>
        <Link to={next.to} className="btn-primary w-full sm:w-auto">{next.label}</Link>
      </div>

      {data.isDemoOrg && (
        <Alert tone="warning" title="You are in the demo workspace">
          Inkloom AI is a fictional brand. The {t.demoContent} piece{t.demoContent === 1 ? '' : 's'} of content here are sample data,
          kept separate from any real activity in your account.
        </Alert>
      )}

      {needsAttention > 0 && (
        <Alert tone="warning" title={`${needsAttention} brand fact${needsAttention === 1 ? '' : 's'} need attention`}>
          One or more approved facts are expired, expiring soon, or overdue for review. Findings based on them are marked
          “needs human review” instead of being treated as reliable.{' '}
          <Link to="/insights" className="link">Review fact freshness</Link>
        </Alert>
      )}

      <section aria-label="How it works" className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">How BrandShield works</h2>
        <StepList steps={[
          { title: 'Add your content', body: 'Paste, upload or link it' },
          { title: 'Check against your rules', body: 'Every issue shows its evidence' },
          { title: 'Fix and get approval', body: 'Reviewer, then approver' },
        ]} current={user.role === 'creator' ? 1 : 3} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Content in workspace" value={t.content} hint={`${t.realContent} yours · ${t.demoContent} demo`} />
        <Stat label="Waiting for review" value={data.byStatus.in_review} hint="Reviewers and approvers act on these" tone={data.byStatus.in_review ? 'brand' : undefined} />
        <Stat label="Approved" value={data.byStatus.approved} hint="Ready to publish" tone="emerald" />
        <Stat label="Open high-risk issues" value={t.openHighSeverity} hint="High or critical, not yet resolved" tone={t.openHighSeverity ? 'rose' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2" aria-label="Work queue">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Work in progress</h2>
            <Link to="/content" className="text-xs font-semibold text-brand-700 hover:underline">See all content</Link>
          </div>
          {data.workQueue.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No content yet" action={<Link to="/content/new" className="btn-primary">Check your first content</Link>}>
                Paste a marketing draft and BrandShield will compare it with your approved brand facts.
              </EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.workQueue.map((c) => (
                <li key={c.id}>
                  <Link to={`/content/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{c.title}</p>
                      <p className="text-xs text-slate-500">{c.author || 'Unknown'} · updated {fmtDateTime(c.updatedAt)}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="Findings by severity">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Issues found so far</h2>
            <p className="mt-0.5 text-xs text-slate-500">Across all content in this workspace</p>
          </div>
          <div className="space-y-3 p-5">
            {t.findings === 0 ? (
              <p className="text-sm text-slate-600">No issues found yet. Run a check to see results here.</p>
            ) : (
              ['critical', 'high', 'medium', 'low'].map((sev) => (
                <div key={sev} className="flex items-center justify-between">
                  <SeverityBadge severity={sev} />
                  <span className="text-sm font-semibold text-slate-800">{data.bySeverity[sev] || 0}</span>
                </div>
              ))
            )}
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <p><strong className="text-slate-700">{t.checked}</strong> of {t.content} content item{t.content === 1 ? '' : 's'} checked · <strong className="text-slate-700">{t.facts}</strong> facts · <strong className="text-slate-700">{t.guidelines}</strong> guidelines</p>
            </div>
          </div>
        </section>
      </div>

      <section className="card" aria-label="Recent activity">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
          <Link to="/audit" className="text-xs font-semibold text-brand-700 hover:underline">Full activity log</Link>
        </div>
        {data.recentAudit.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nothing has happened yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recentAudit.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{a.summary || a.action}</p>
                  <p className="text-xs text-slate-500">{a.actorName} · {fmtDateTime(a.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  const tones = { brand: 'text-brand-700', emerald: 'text-emerald-700', rose: 'text-rose-700' };
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone] || 'text-slate-900'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
