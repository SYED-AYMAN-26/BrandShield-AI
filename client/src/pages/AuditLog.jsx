import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Alert, Loading, fmtDateTime, EmptyState } from '../lib/ui.jsx';

const ACTION_LABEL = {
  'user.registered': 'Account created', 'user.login': 'Signed in', 'user.logout': 'Signed out',
  'user.profile_updated': 'Profile updated', 'user.password_changed': 'Password changed',
  'fact.created': 'Brand fact added', 'fact.updated': 'Brand fact updated', 'fact.retired': 'Brand fact retired',
  'guideline.created': 'Guideline added', 'guideline.updated': 'Guideline updated', 'guideline.retired': 'Guideline retired',
  'content.created': 'Content created', 'content.edited': 'Content edited', 'content.checked': 'Content checked',
  'content.submitted': 'Sent for review', 'content.approved': 'Content approved', 'content.rejected': 'Content rejected',
  'review.commented': 'Reviewer comment', 'review.changes_requested': 'Changes requested',
  'finding.accepted': 'Finding accepted', 'finding.dismissed': 'Finding dismissed',
  'ambiguity.accepted': 'Guideline clarified', 'ambiguity.edited': 'Guideline edited', 'ambiguity.rejected': 'Clarification rejected',
  'evaluation.run': 'Accuracy check run', 'input.file_extracted': 'Text extracted from file', 'input.url_fetched': 'Web page fetched',
};

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/audit')
      .then((d) => setEvents(d.events))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Activity log</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          A permanent record of what happened in this workspace and who did it. Reviewers and approvers rely on this during an audit.
        </p>
      </div>

      {error && <Alert tone="error" title="Could not load the activity log">{error}</Alert>}
      {loading ? <Loading label="Loading activity…" /> : events.length === 0 ? (
        <EmptyState title="Nothing recorded yet">Activity appears here as soon as people start using the workspace.</EmptyState>
      ) : (
        <ol className="card divide-y divide-slate-100">
          {events.map((e) => (
            <li key={e._id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{ACTION_LABEL[e.action] || e.action}</p>
                <p className="text-sm text-slate-600">{e.summary}</p>
                <p className="mt-0.5 text-xs text-slate-500">{e.actorName} · {e.actorRole?.replace('_', ' ')} · {fmtDateTime(e.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
