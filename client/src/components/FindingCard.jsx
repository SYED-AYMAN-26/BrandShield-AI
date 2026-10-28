import { useState } from 'react';
import { SeverityBadge, TYPE_LABELS, Modal } from '../lib/ui.jsx';

/**
 * One finding, explained in plain English.
 * Deliberately never uses words like "LLM", "embedding" or "confidence score".
 */
export default function FindingCard({ finding, index, canFix, canDecide, onApplyFix, onDecide, busy, help }) {
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [reason, setReason] = useState('');
  const decided = ['accepted', 'dismissed', 'fixed'].includes(finding.status);

  return (
    <article className={`card overflow-hidden ${decided ? 'opacity-80' : ''}`} aria-labelledby={`finding-${finding._id}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-500">Issue {index + 1}</span>
        <SeverityBadge severity={finding.severity} />
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
          {TYPE_LABELS[finding.type] || finding.type}
        </span>
        {finding.source === 'ai' && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200">AI-assisted</span>}
        {decided && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${finding.status === 'dismissed' ? 'bg-slate-100 text-slate-700 ring-slate-200' : 'bg-emerald-100 text-emerald-800 ring-emerald-200'}`}>
            {finding.status === 'dismissed' ? 'Dismissed by reviewer' : finding.status === 'fixed' ? 'Fixed' : 'Accepted by reviewer'}
          </span>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div>
          <h3 id={`finding-${finding._id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">The sentence in your content</h3>
          <blockquote className="mt-1.5 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-slate-800">
            “{finding.excerpt}”
          </blockquote>
          {finding.excerptVerified && <p className="mt-1 text-[11px] text-emerald-700">✓ Checked: this text appears word-for-word in your content.</p>}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {finding.type === 'conflict' ? 'What it contradicts' : 'The approved brand rule behind this'}
          </h3>
          <p className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{finding.evidence}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {finding.factKey
              ? `Approved fact “${finding.factKey}” · version ${finding.factVersion}`
              : finding.guidelineCode
                ? `Guideline ${finding.guidelineCode} · version ${finding.guidelineVersion}`
                : 'Internal claim standard'}
            {finding.evidenceSource ? ` · ${finding.evidenceSource}` : ''}
          </p>
          {finding.evidenceVerified && <p className="mt-1 text-[11px] text-emerald-700">✓ Checked: this evidence is quoted from your approved source.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</h3>
            <p className="mt-1 text-sm text-slate-700">{finding.explanation}</p>
            {finding.whyItMatters && <p className="mt-1 text-xs text-slate-500">{finding.whyItMatters}</p>}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">How to fix it</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{finding.suggestedFix}</p>
          </div>
        </div>

        {help && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-600">What does “{TYPE_LABELS[finding.type]}” mean?</summary>
            <p className="mt-1">{help.types?.[finding.type]}</p>
            <p className="mt-1">{help.severity?.[finding.severity]}</p>
          </details>
        )}

        {(canFix || canDecide) && !decided && (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
            {canFix && finding.autoFix && (
              <button type="button" className="btn-primary" onClick={() => onApplyFix(finding)} disabled={busy}>
                Fix this for me
              </button>
            )}
            {canFix && !finding.autoFix && (
              <p className="text-xs text-slate-500">Edit the sentence yourself using the suggestion above, then run the check again.</p>
            )}
            {canDecide && (
              <>
                <button type="button" className="btn-secondary" onClick={() => onDecide(finding, 'accepted')} disabled={busy}>Accept finding</button>
                <button type="button" className="btn-secondary" onClick={() => setConfirmDismiss(true)} disabled={busy}>Dismiss with reason</button>
              </>
            )}
          </div>
        )}
      </div>

      <Modal open={confirmDismiss} onClose={() => setConfirmDismiss(false)} title="Dismiss this finding?"
        footer={<>
          <button className="btn-secondary w-full sm:w-auto" onClick={() => setConfirmDismiss(false)}>Cancel</button>
          <button className="btn-primary w-full sm:w-auto" disabled={reason.trim().length < 3}
            onClick={async () => { await onDecide(finding, 'dismissed', reason.trim()); setConfirmDismiss(false); setReason(''); }}>
            Dismiss finding
          </button>
        </>}>
        <p>Dismissing tells the team this issue is acceptable. The reason is saved in the audit log, so please explain briefly why it is safe to publish.</p>
        <label htmlFor="dismiss-reason" className="label mt-3">Reason (required)</label>
        <textarea id="dismiss-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. The headline claim is approved in the brand book, section 5." />
        <p className="help">Needs at least 3 characters. {reason.trim().length}/3</p>
      </Modal>
    </article>
  );
}
