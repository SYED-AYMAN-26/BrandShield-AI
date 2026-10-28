import { useEffect, useRef } from 'react';

export const SEVERITY_STYLES = {
  critical: { badge: 'bg-rose-100 text-rose-800 ring-rose-200', dot: 'bg-rose-600', label: 'Critical' },
  high: { badge: 'bg-orange-100 text-orange-800 ring-orange-200', dot: 'bg-orange-500', label: 'High' },
  medium: { badge: 'bg-amber-100 text-amber-900 ring-amber-200', dot: 'bg-amber-500', label: 'Medium' },
  low: { badge: 'bg-sky-100 text-sky-800 ring-sky-200', dot: 'bg-sky-500', label: 'Low' },
};

export const TYPE_LABELS = {
  conflict: 'Confirmed conflict',
  unsupported_claim: 'Unsupported claim',
  possible_issue: 'Possible issue',
  needs_human_review: 'Needs human review',
};

export const STATUS_STYLES = {
  draft: { badge: 'bg-slate-100 text-slate-700 ring-slate-200', label: 'Draft' },
  in_review: { badge: 'bg-indigo-100 text-indigo-800 ring-indigo-200', label: 'In review' },
  changes_requested: { badge: 'bg-amber-100 text-amber-900 ring-amber-200', label: 'Changes requested' },
  approved: { badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200', label: 'Approved' },
  rejected: { badge: 'bg-rose-100 text-rose-800 ring-rose-200', label: 'Rejected' },
};

export function Badge({ children, tone = 'slate', className = '' }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset bg-${tone}-100 text-${tone}-800 ring-${tone}-200 ${className}`}>{children}</span>;
}

export function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.badge}`}>{s.label}</span>;
}

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { badge: 'bg-slate-100 text-slate-700 ring-slate-200', label: status };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.badge}`}>{s.label}</span>;
}

export function Spinner({ className = '' }) {
  return (
    <span role="status" aria-label="Loading" className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />
  );
}

export function Alert({ tone = 'info', title, children, onClose }) {
  const tones = {
    info: 'bg-brand-50 text-brand-900 border-brand-200',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-rose-50 text-rose-900 border-rose-200',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {title && <p className="font-semibold">{title}</p>}
          <div className={title ? 'mt-1' : ''}>{children}</div>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Dismiss message" className="rounded p-1 hover:bg-black/5">✕</button>}
      </div>
    </div>
  );
}

/** Blocks interaction and announces progress to screen readers. */
export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-6 text-sm text-slate-600" role="status" aria-live="polite">
      <Spinner className="text-brand-600" /> {label}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="card p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl" aria-hidden="true">🛡️</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, textarea, button');
    first?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost -mr-2 px-2 py-1" aria-label="Close">✕</button>
        </div>
        <div className="text-sm text-slate-700">{children}</div>
        {footer && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onCancel, onConfirm, title, body, confirmLabel = 'Yes, continue', destructive = true, busy = false }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<>
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={`${destructive ? 'btn-danger' : 'btn-primary'} w-full sm:w-auto`} onClick={onConfirm} disabled={busy}>
          {busy ? <><Spinner /> Working…</> : confirmLabel}
        </button>
      </>}>
      <p>{body}</p>
    </Modal>
  );
}

/** Plain-English explanation of what the checker can and cannot decide. */
export function TrustNote({ mode, aiDisabledReason }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <p className="font-semibold text-slate-700">
        {mode === 'ai-assisted' ? 'Checked by rules plus AI assistance' : 'Checked by deterministic brand rules'}
      </p>
      <p className="mt-1">
        {mode === 'ai-assisted'
          ? 'Your brand rules always run first. AI assistance can add findings, but only when it quotes your content exactly and cites an approved brand source. Anything that fails those checks is discarded.'
          : 'Every issue below comes from one of your approved brand facts or guidelines. No external AI service is used, so nothing leaves this server.'}
      </p>
      {aiDisabledReason && <p className="mt-1 text-slate-500">{aiDisabledReason}</p>}
      <p className="mt-1">The checker can miss issues. A reviewer must still read the content before approval.</p>
    </div>
  );
}

export function StepList({ steps, current }) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-2" aria-label="How it works">
      {steps.map((s, i) => {
        const active = i + 1 <= current;
        return (
          <li key={s.title} className="flex flex-1 items-start gap-3">
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{i + 1}</span>
            <div>
              <p className={`text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-600'}`}>{s.title}</p>
              <p className="text-xs text-slate-500">{s.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
