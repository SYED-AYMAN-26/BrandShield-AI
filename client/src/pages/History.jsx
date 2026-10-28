import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Alert, Loading, StatusBadge, fmtDateTime } from '../lib/ui.jsx';

export default function History() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/content/${id}/history`).then(setData).catch((e) => setError(e.message)); }, [id]);

  if (error) return <Alert tone="error" title="Could not load history">{error}</Alert>;
  if (!data) return <Loading label="Loading revision history…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav className="text-xs text-slate-500"><Link to="/content" className="hover:underline">Content</Link> / <Link to={`/content/${id}`} className="hover:underline">Back to content</Link></nav>
      <h1 className="text-2xl font-bold text-slate-900">Revision history</h1>
      <p className="text-sm text-slate-600">Every version and review is kept so decisions can be explained later.</p>

      <section className="card">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Versions</h2>
        <ol className="divide-y divide-slate-100">
          {data.versions.map((v) => (
            <li key={`${v.version}-${v.at}`} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">v{v.version}</span>
                <span className="text-sm font-medium text-slate-900">{v.note || 'Edited'}</span>
                <span className="text-xs text-slate-500">{v.by?.name} · {fmtDateTime(v.at)}</span>
              </div>
              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans text-xs text-slate-700">{v.body}</pre>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Reviews</h2>
        {data.reviews.length === 0 ? <p className="p-4 text-sm text-slate-600">No review has been requested yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.reviews.map((r) => (
              <li key={r._id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-slate-500">requested {fmtDateTime(r.createdAt)}</span>
                </div>
                {r.decisionNote && <p className="mt-1 text-sm text-slate-700">Note: {r.decisionNote}</p>}
                {r.comments?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.comments.map((c, i) => <li key={i} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">“{c.body}” — {c.byName}</li>)}
                  </ul>
                )}
                {r.decisions?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.decisions.map((d, i) => <li key={i} className="text-xs text-slate-600"><strong className="capitalize">{d.action}</strong>: {d.reason} — {d.byName}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
