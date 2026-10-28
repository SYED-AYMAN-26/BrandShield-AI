import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Loading, StatusBadge, EmptyState, fmtDateTime } from '../lib/ui.jsx';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'in_review', label: 'Waiting for review' },
  { key: 'changes_requested', label: 'Changes requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function ContentList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/content?status=${encodeURIComponent(status)}`)
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status]);

  const counts = useMemo(() => items.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {}), [items]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Content</h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.role === 'creator' || user.role === 'brand_manager'
              ? 'Everything you have written and checked, and where it is in the approval process.'
              : 'Content that has been checked against your brand rules.'}
          </p>
        </div>
        <Link to="/content/new" className="btn-primary w-full sm:w-auto">+ Check new content</Link>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={status === f.key}
            onClick={() => setParams(f.key === 'all' ? {} : { status: f.key })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${status === f.key ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert tone="error" title="Could not load your content">{error}</Alert>}
      {loading ? <Loading label="Loading content…" /> : items.length === 0 ? (
        <EmptyState title={status === 'all' ? 'No content yet' : 'Nothing in this list'} action={<Link to="/content/new" className="btn-primary">Check new content</Link>}>
          {status === 'all'
            ? 'Paste a marketing draft, upload a file, or add a web page address. BrandShield will compare it with your approved brand facts and guidelines.'
            : 'Try another filter, or start a new content check.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c._id}>
              <Link to={`/content/${c._id}`} className="card flex flex-col gap-3 p-4 transition hover:border-brand-300 hover:shadow-md sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-slate-900">{c.title}</h2>
                    <StatusBadge status={c.status} />
                    {c.isDemo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">Demo data</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {c.channel?.replace('_', ' ')} · version {c.version} · {c.authorId?.name || 'Unknown'} · updated {fmtDateTime(c.updatedAt)}
                  </p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  {c.lastCheck?.totals ? (
                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-900">{c.lastCheck.totals.total}</strong> issue{c.lastCheck.totals.total === 1 ? '' : 's'} found
                      {c.lastCheck.totals.blocking > 0 && <span className="ml-1 font-semibold text-rose-700">({c.lastCheck.totals.blocking} high-risk)</span>}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Not checked yet</p>
                  )}
                  <p className="text-[11px] text-slate-400">{c.lastCheck?.mode === 'ai-assisted' ? 'Rules + AI' : c.lastCheck ? 'Rules only' : ''}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
