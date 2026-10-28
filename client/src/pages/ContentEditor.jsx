import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  Alert, Loading, Spinner, StatusBadge, SeverityBadge, ConfirmDialog, fmtDateTime, TrustNote, Modal,
} from '../lib/ui.jsx';
import FindingCard from '../components/FindingCard.jsx';

const CHANNELS = [
  ['landing_page', 'Landing page'], ['email', 'Email'], ['social', 'Social post'],
  ['ad', 'Advertisement'], ['blog', 'Blog article'], ['other', 'Something else'],
];

const SAMPLE = `Meet Inkloom AI — the best writing assistant for busy marketing teams.

Our Pro plan is just ₹1,999 per user per month, and every plan includes a 30 day free trial with no credit card.

We are trusted by 12,000 customers, and we guarantee you will cut drafting time in half.`;

export default function ContentEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('landing_page');
  const [body, setBody] = useState('');
  const [content, setContent] = useState(null);
  const [findings, setFindings] = useState([]);
  const [totals, setTotals] = useState(null);
  const [mode, setMode] = useState(null);
  const [aiInfo, setAiInfo] = useState(null);
  const [help, setHelp] = useState(null);
  const [review, setReview] = useState(null);
  const [statusHelp, setStatusHelp] = useState('');
  const [injection, setInjection] = useState(null);
  const [checkedAt, setCheckedAt] = useState(null);

  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [showExtract, setShowExtract] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [showSubmitCheck, setShowSubmitCheck] = useState(false);

  const canEdit = ['creator', 'brand_manager'].includes(user.role);
  const canDecide = ['reviewer', 'brand_manager'].includes(user.role);
  const canApprove = ['approver', 'brand_manager'].includes(user.role);
  const isAuthor = content && (String(content.authorId?._id || content.authorId) === user.id);
  const editable = canEdit && (!content || ['draft', 'changes_requested', 'rejected'].includes(content.status)) && (isAuthor || user.role === 'brand_manager');
  const bodyRef = useRef(null);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true); setError('');
    try {
      const d = await api.get(`/content/${id}`);
      setContent(d.content);
      setTitle(d.content.title);
      setChannel(d.content.channel);
      setBody(d.content.body);
      setFindings(d.content.findings || []);
      setTotals(d.content.lastCheck?.totals || null);
      setMode(d.content.lastCheck?.mode || null);
      setCheckedAt(d.content.lastCheck?.at || null);
      setAiInfo(d.ai);
      setHelp(d.help);
      setReview(d.review);
      setStatusHelp(d.statusHelp);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 5000); };

  const createContent = async () => {
    setError(''); setFieldErrors({});
    if (title.trim().length < 3) return setFieldErrors({ title: 'Give your content a name of at least 3 characters.' });
    if (body.trim().length < 10) return setFieldErrors({ body: 'Add at least 10 characters of content to check.' });
    setBusy('create');
    try {
      const d = await api.post('/content', { title: title.trim(), body, channel });
      navigate(`/content/${d.content._id}`, { replace: true });
    } catch (e) { setError(e.message); if (e.details) setFieldErrors(e.details); }
    finally { setBusy(''); }
  };

  const saveEdits = async (silent = false) => {
    setError(''); setFieldErrors({});
    setBusy('save');
    try {
      const d = await api.patch(`/content/${id}`, { title: title.trim(), body, channel });
      setContent(d.content);
      if (!silent) flash('Your changes are saved.');
      return true;
    } catch (e) { setError(e.message); if (e.details) setFieldErrors(e.details); return false; }
    finally { setBusy(''); }
  };

  const runCheck = async () => {
    setError(''); setNotice('');
    setBusy('check');
    try {
      if (editable && (title !== content.title || body !== content.body || channel !== content.channel)) {
        const saved = await saveEdits(true);
        if (!saved) return;
      }
      const d = await api.post(`/content/${id}/check`, {});
      setFindings(d.findings || []);
      setTotals(d.totals);
      setMode(d.mode);
      setCheckedAt(d.checkedAt);
      setInjection(d.injection);
      if (d.help) setHelp(d.help);
      await load();
      flash(d.totals.total === 0
        ? 'Check complete. No issues found against your approved brand rules.'
        : `Check complete. ${d.totals.total} issue${d.totals.total === 1 ? '' : 's'} found — read each one below.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const applyFix = async (finding) => {
    if (!finding.autoFix) return;
    if (!body.includes(finding.autoFix.find)) {
      setError('That exact text is no longer in your content. Run the check again to get fresh suggestions.');
      return;
    }
    setBusy(`fix-${finding._id}`);
    try {
      const updated = body.split(finding.autoFix.find).join(finding.autoFix.replace);
      setBody(updated);
      const d = await api.patch(`/content/${id}`, { body: updated, title: title.trim(), channel });
      setContent(d.content);
      flash(`${finding.autoFix.description}. Run the check again to confirm the issue is gone.`);
      // Collapse the fixed finding locally so the list reflects reality straight away.
      setFindings((prev) => prev.map((f) => (f._id === finding._id ? { ...f, status: 'fixed' } : f)));
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const decide = async (finding, action, reason = '') => {
    setBusy(`decide-${finding._id}`);
    try {
      const d = await api.post(`/content/${id}/findings/${finding._id}/decision`, { action, reason });
      setFindings(d.content.findings);
      flash(action === 'accepted' ? 'Finding accepted and recorded.' : 'Finding dismissed with your reason on record.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const submitForReview = async () => {
    setBusy('submit');
    try {
      await api.post(`/content/${id}/submit`, {});
      await load();
      flash('Sent for review. A reviewer will look at the findings next.');
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const requestChanges = async (note) => {
    setBusy('changes');
    try { await api.post(`/content/${id}/review/request-changes`, { note }); await load(); flash('Change request sent to the creator.'); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const addComment = async (text) => {
    setBusy('comment');
    try { await api.post(`/content/${id}/review/comment`, { body: text }); await load(); flash('Comment added.'); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const decideApproval = async (approve, note) => {
    setBusy('approve');
    try {
      if (approve) await api.post(`/content/${id}/approve`, { note });
      else await api.post(`/content/${id}/reject`, { reason: note });
      await load();
      flash(approve ? 'Content approved. It is ready to publish.' : 'Content rejected. The creator can revise and resubmit.');
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const openFindings = useMemo(() => findings.filter((f) => f.status === 'open'), [findings]);
  const blocking = useMemo(() => openFindings.filter((f) => ['high', 'critical'].includes(f.severity)), [openFindings]);

  if (loading) return <Loading label="Loading your content…" />;

  /* ------------------------------- New content ------------------------------- */
  if (isNew) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Check new content</h1>
          <p className="mt-1 text-sm text-slate-600">
            Paste the marketing text you want to check. BrandShield compares it with your approved brand facts and guidelines,
            then explains every issue with the exact sentence and the approved source behind it.
          </p>
        </div>

        {error && <Alert tone="error" title="Could not continue">{error}</Alert>}

        <div className="card space-y-5 p-5">
          <div>
            <label htmlFor="title" className="label">What is this content? <span className="font-normal text-slate-500">(a name only you will see)</span></label>
            <input id="title" className="input" placeholder="e.g. October launch email" value={title}
              onChange={(e) => setTitle(e.target.value)} aria-invalid={!!fieldErrors.title} maxLength={200} />
            {fieldErrors.title && <p className="field-error">{fieldErrors.title}</p>}
          </div>

          <div>
            <label htmlFor="channel" className="label">Where will it be published?</label>
            <select id="channel" className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <p className="help">This matters: some rules only apply to certain channels (for example AI disclosure on landing pages).</p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="body" className="label mb-0">Your marketing content</label>
              <div className="flex gap-2">
                {body.trim().length === 0 && (
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => { setTitle('Landing page draft with issues'); setBody(SAMPLE); setChannel('landing_page'); }}>
                    Use a sample with known issues
                  </button>
                )}
                <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowExtract(true)}>Upload a file or link a page</button>
              </div>
            </div>
            <textarea id="body" ref={bodyRef} className="input mt-1.5 font-mono text-[13px] leading-relaxed" rows={12}
              placeholder="Paste your marketing copy here…" value={body}
              onChange={(e) => setBody(e.target.value)} aria-invalid={!!fieldErrors.body} maxLength={20000} />
            <div className="mt-1 flex items-center justify-between">
              {fieldErrors.body ? <p className="field-error">{fieldErrors.body}</p> : <p className="help">Plain text works best. Formatting is not checked.</p>}
              <p className="help">{body.length}/20000</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link to="/content" className="btn-secondary">Cancel</Link>
            <button type="button" className="btn-primary" onClick={createContent} disabled={busy === 'create'}>
              {busy === 'create' ? <><Spinner /> Saving…</> : 'Save and continue'}
            </button>
          </div>
        </div>

        <Alert tone="info" title="What happens next">
          You will get a list of issues with the evidence behind each one. You can fix them yourself, then send the content
          to a reviewer and an approver.
        </Alert>

        <ExtractDialog open={showExtract} onClose={() => setShowExtract(false)}
          onExtracted={(text, note) => { setBody(text); setShowExtract(false); flash(note); }} />
      </div>
    );
  }

  if (!content) return <Alert tone="error" title="Content not found">That content may have been deleted. <Link to="/content" className="link">Back to content</Link></Alert>;

  /* ------------------------------- Existing content ------------------------------- */
  return (
    <div className="space-y-5">
      <nav className="text-xs text-slate-500" aria-label="Breadcrumb">
        <Link to="/content" className="hover:underline">Content</Link> <span aria-hidden="true">/</span> <span className="text-slate-700">{content.title}</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{content.title}</h1>
            <StatusBadge status={content.status} />
            {content.isDemo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-200">Demo data</span>}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {CHANNELS.find(([v]) => v === content.channel)?.[1]} · version {content.version} · created by {content.authorId?.name || 'unknown'}
          </p>
          {statusHelp && <p className="mt-1 text-xs text-slate-500">{statusHelp}</p>}
        </div>
        <Link to={`/content/${id}/history`} className="hidden" aria-hidden="true">history</Link>
      </div>

      {error && <Alert tone="error" title="Something went wrong" onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
      {injection?.attempts?.length > 0 && (
        <Alert tone="warning" title="Instructions were found inside your content">
          Your content contains text that looks like an instruction to the checking system (for example “ignore previous instructions”).
          It was treated as ordinary text and did not influence the results. Real issues were still checked normally.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ------------------------------ Left: editor ------------------------------ */}
        <div className="space-y-4 lg:col-span-3">
          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Your content</h2>
              {!editable && <span className="text-xs text-slate-500">Locked while {content.status.replace('_', ' ')}</span>}
            </div>
            <div className="space-y-3 p-4">
              {editable ? (
                <>
                  <div>
                    <label htmlFor="edit-title" className="label">Title</label>
                    <input id="edit-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
                    {fieldErrors.title && <p className="field-error">{fieldErrors.title}</p>}
                  </div>
                  <div>
                    <label htmlFor="edit-channel" className="label">Channel</label>
                    <select id="edit-channel" className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                      {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-body" className="label">Content</label>
                    <textarea id="edit-body" className="input font-mono text-[13px] leading-relaxed" rows={14}
                      value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} />
                    {fieldErrors.body && <p className="field-error">{fieldErrors.body}</p>}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    <button type="button" className="btn-ghost" onClick={() => setShowExtract(true)}>Replace with a file or web page</button>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" className="btn-secondary" onClick={() => saveEdits()} disabled={busy === 'save'}>
                        {busy === 'save' ? <><Spinner /> Saving…</> : 'Save changes'}
                      </button>
                      <button type="button" className="btn-primary" onClick={runCheck} disabled={busy === 'check'}>
                        {busy === 'check' ? <><Spinner /> Checking…</> : totals ? 'Check Content again' : 'Check Content'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-800">{content.body}</pre>
              )}
            </div>
          </section>

          <section className="card p-4" aria-label="Review conversation">
            <h2 className="text-sm font-semibold text-slate-900">Review conversation</h2>
            {review?.comments?.length ? (
              <ul className="mt-3 space-y-3">
                {review.comments.map((c, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-sm text-slate-800">{c.body}</p>
                    <p className="mt-1 text-xs text-slate-500">{c.byName} · {fmtDateTime(c.at)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-600">No comments yet.</p>}
            {review?.decisions?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reviewer decisions</h3>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                  {review.decisions.map((d, i) => (
                    <li key={i}><strong className="capitalize text-slate-800">{d.action}</strong> — {d.reason || 'no reason'} <span className="text-slate-400">({d.byName})</span></li>
                  ))}
                </ul>
              </div>
            )}
            {content.status === 'in_review' && canDecide && (
              <button type="button" className="btn-secondary mt-4" onClick={() => setShowComment(true)}>Add a comment</button>
            )}
          </section>
        </div>

        {/* ------------------------------ Right: actions + findings ------------------------------ */}
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-4" aria-label="Next steps">
            <h2 className="text-sm font-semibold text-slate-900">Next step</h2>
            <div className="mt-3 space-y-2">
              {content.status === 'draft' && editable && (
                <>
                  <button type="button" className="btn-primary w-full" onClick={runCheck} disabled={busy === 'check'}>
                    {busy === 'check' ? <><Spinner /> Checking…</> : 'Check Content'}
                  </button>
                  <button type="button" className="btn-secondary w-full" onClick={() => setShowSubmitCheck(true)} disabled={!totals || busy === 'submit'}>
                    Submit for Review
                  </button>
                  {!totals && <p className="help">Run a check first so the reviewer can see the findings.</p>}
                </>
              )}

              {content.status === 'in_review' && canDecide && (
                <>
                  <p className="text-sm text-slate-700">Review the findings below, then choose one:</p>
                  <button type="button" className="btn-secondary w-full" onClick={() => setConfirm({ kind: 'changes' })}>Request changes</button>
                  {canApprove && (
                    <button type="button" className="btn-primary w-full" onClick={() => setConfirm({ kind: 'approve' })} disabled={blocking.length > 0}>
                      Approve content
                    </button>
                  )}
                  {canApprove && blocking.length > 0 && <p className="help">Resolve or dismiss the {blocking.length} high-risk finding{blocking.length === 1 ? '' : 's'} first.</p>}
                </>
              )}

              {content.status === 'in_review' && canApprove && !canDecide && (
                <>
                  <button type="button" className="btn-primary w-full" onClick={() => setConfirm({ kind: 'approve' })} disabled={blocking.length > 0}>Approve content</button>
                  <button type="button" className="btn-secondary w-full" onClick={() => setConfirm({ kind: 'reject' })}>Reject content</button>
                  {blocking.length > 0 && <p className="help">A reviewer must resolve the {blocking.length} high-risk finding{blocking.length === 1 ? '' : 's'} first.</p>}
                </>
              )}

              {content.status === 'in_review' && !canDecide && !canApprove && <p className="text-sm text-slate-600">Waiting for a reviewer. You cannot edit until they respond.</p>}

              {content.status === 'changes_requested' && editable && (
                <>
                  <Alert tone="warning" title="The reviewer asked for changes">
                    {review?.decisionNote || 'Read the conversation, fix the issues, then check and submit again.'}
                  </Alert>
                  <button type="button" className="btn-primary w-full" onClick={runCheck} disabled={busy === 'check'}>Check Content</button>
                  <button type="button" className="btn-secondary w-full" onClick={() => setShowSubmitCheck(true)} disabled={busy === 'submit'}>Submit for Review</button>
                </>
              )}

              {content.status === 'rejected' && editable && (
                <>
                  <Alert tone="warning" title="This content was rejected">{content.rejectedReason}</Alert>
                  <button type="button" className="btn-primary w-full" onClick={runCheck} disabled={busy === 'check'}>Fix and check again</button>
                  <button type="button" className="btn-secondary w-full" onClick={() => setShowSubmitCheck(true)} disabled={busy === 'submit'}>Resubmit for Review</button>
                </>
              )}

              {content.status === 'approved' && (
                <Alert tone="success" title="Approved and ready to publish">
                  Approved {fmtDateTime(content.approvedAt)}.
                </Alert>
              )}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <Link to={`/content/${id}/history`} onClick={(e) => { e.preventDefault(); navigate(`/content/${id}#history`); }} className="hidden">History</Link>
              <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={async () => {
                const d = await api.get(`/content/${id}/history`);
                setConfirm({ kind: 'history', versions: d.versions });
              }}>View revision history ({content.version} version{content.version === 1 ? '' : 's'})</button>
            </div>
          </section>

          <section aria-label="Findings summary" className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900">Check results</h2>
            {!totals ? (
              <p className="mt-2 text-sm text-slate-600">Not checked yet. Run <strong>Check Content</strong> to compare this content with your brand rules.</p>
            ) : (
              <>
                <p className="mt-2 text-3xl font-bold text-slate-900">{totals.total}</p>
                <p className="text-sm text-slate-600">
                  issue{totals.total === 1 ? '' : 's'} found{totals.total > 0 ? ` · ${totals.blocking} need attention before approval` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['critical', 'high', 'medium', 'low'].filter((s) => totals.bySeverity[s] > 0).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5"><SeverityBadge severity={s} /><span className="text-xs text-slate-600">{totals.bySeverity[s]}</span></span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">Checked {fmtDateTime(checkedAt)}</p>
                <div className="mt-3"><TrustNote mode={mode} aiDisabledReason={aiInfo?.enabled ? null : aiInfo?.reason} /></div>
              </>
            )}
          </section>
        </div>
      </div>

      {/* ------------------------------ Findings list ------------------------------ */}
      {totals && (
        <section aria-label="Findings" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              {openFindings.length === 0 ? 'All issues resolved' : `${openFindings.length} issue${openFindings.length === 1 ? '' : 's'} to review`}
            </h2>
            {findings.length > 0 && <p className="text-xs text-slate-500">Ordered by severity. Each one shows its own evidence.</p>}
          </div>

          {findings.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-3xl" aria-hidden="true">✅</p>
              <h3 className="mt-2 text-base font-semibold text-slate-900">Nothing found against your brand rules</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                Every approved fact and guideline was checked and no issue was detected. This does not guarantee the content is
                perfect — a reviewer should still read it before publishing.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {findings.map((f, i) => (
                <FindingCard key={f._id || i} finding={f} index={i} help={help}
                  canFix={editable} canDecide={canDecide && content.status === 'in_review'}
                  onApplyFix={applyFix} onDecide={decide}
                  busy={busy.startsWith('fix-') || busy.startsWith('decide-')} />
              ))}
            </div>
          )}
        </section>
      )}

      <ExtractDialog open={showExtract} onClose={() => setShowExtract(false)}
        onExtracted={async (text, note) => { setBody(text); setShowExtract(false); flash(`${note} Review the text, then check again.`); }} />

      <CommentDialog open={showComment} onClose={() => setShowComment(false)} onSubmit={addComment} busy={busy === 'comment'} />

      <ConfirmDialog open={confirm?.kind === 'approve'} destructive={false} busy={busy === 'approve'}
        title="Approve this content?" body="Approving marks the content as ready to publish. The creator and reviewers will see that you approved it."
        confirmLabel="Approve content" onCancel={() => setConfirm(null)}
        onConfirm={async () => { await decideApproval(true, ''); setConfirm(null); }} />

      <ConfirmDialog open={confirm?.kind === 'reject'} busy={busy === 'approve'}
        title="Reject this content?" body="Rejecting sends it back to the creator with your reason. They can revise and resubmit."
        confirmLabel="Reject content" onCancel={() => setConfirm(null)}
        onConfirm={async () => { setConfirm({ kind: 'reject-reason' }); }} />

      <ReasonDialog open={confirm?.kind === 'reject-reason'} title="Why are you rejecting this?" label="Reason for rejection"
        confirmLabel="Reject content" busy={busy === 'approve'} onClose={() => setConfirm(null)}
        onSubmit={async (reason) => { await decideApproval(false, reason); setConfirm(null); }} />

      <ReasonDialog open={confirm?.kind === 'changes'} title="What needs to change?" label="Message to the creator"
        confirmLabel="Request changes" busy={busy === 'changes'} onClose={() => setConfirm(null)}
        onSubmit={async (note) => { await requestChanges(note); setConfirm(null); }} />

      <ConfirmDialog open={showSubmitCheck} destructive={false} busy={busy === 'submit'}
        title="Submit for review?"
        body={blocking.length > 0
          ? `This content still has ${blocking.length} high-risk issue${blocking.length === 1 ? '' : 's'}. You can still submit — the reviewer will need to accept or dismiss them before approval.`
          : 'A reviewer will check the findings, and then an approver gives the final sign-off.'}
        confirmLabel="Submit for review" onCancel={() => setShowSubmitCheck(false)}
        onConfirm={async () => { setShowSubmitCheck(false); await submitForReview(); }} />

      <Modal open={confirm?.kind === 'history'} onClose={() => setConfirm(null)} title="Revision history">
        <ol className="space-y-3">
          {(confirm?.versions || []).map((v) => (
            <li key={`${v.version}-${v.at}`} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700">Version {v.version} · {v.note || 'Edited'}</p>
              <p className="text-xs text-slate-500">{fmtDateTime(v.at)}</p>
              <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">{v.body}</p>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  );
}

/* ------------------------------ Helper dialogs ------------------------------ */

function ReasonDialog({ open, title, label, confirmLabel, onSubmit, onClose, busy }) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <button className="btn-secondary w-full sm:w-auto" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary w-full sm:w-auto" disabled={text.trim().length < 3 || busy} onClick={() => onSubmit(text.trim())}>
          {busy ? <><Spinner /> Sending…</> : confirmLabel}
        </button>
      </>}>
      <label htmlFor="reason-text" className="label">{label}</label>
      <textarea id="reason-text" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Be specific so the other person knows exactly what to change." maxLength={2000} />
      <p className="help">At least 3 characters. {text.trim().length}/3</p>
    </Modal>
  );
}

function CommentDialog({ open, onClose, onSubmit, busy }) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add a comment"
      footer={<>
        <button className="btn-secondary w-full sm:w-auto" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary w-full sm:w-auto" disabled={text.trim().length < 2 || busy} onClick={() => onSubmit(text.trim())}>
          {busy ? <><Spinner /> Posting…</> : 'Post comment'}
        </button>
      </>}>
      <label htmlFor="comment-text" className="label">Comment for the creator</label>
      <textarea id="comment-text" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
    </Modal>
  );
}

function ExtractDialog({ open, onClose, onExtracted }) {
  const [tab, setTab] = useState('file');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => { if (open) { setError(''); setPreview(null); setWarnings([]); } }, [open]);

  const uploadFile = async (file) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const d = await api.upload('/content/extract/upload', fd);
      setPreview({ text: d.text, kind: d.kind, chars: d.chars });
      setWarnings(d.warnings || []);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const fetchUrl = async () => {
    setBusy(true); setError('');
    try {
      const d = await api.post('/content/extract/url', { url });
      setPreview({ text: d.text, kind: 'web page', chars: d.chars });
      setWarnings(d.warnings || []);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add content from a file or web page"
      footer={<>
        <button className="btn-secondary w-full sm:w-auto" onClick={onClose}>Cancel</button>
        <button className="btn-primary w-full sm:w-auto" disabled={!preview || busy} onClick={() => onExtracted(preview.text, 'Text was extracted.')}>
          Use this text
        </button>
      </>}>
      <div className="mb-4 flex gap-2">
        <button type="button" className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'file' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setTab('file')}>Upload a file</button>
        <button type="button" className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'url' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setTab('url')}>Use a web page</button>
      </div>

      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}

      {tab === 'file' ? (
        <div>
          <label htmlFor="file-input" className="label">Choose a file</label>
          <input id="file-input" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.txt,.md,image/*" className="input file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-800"
            onChange={(e) => uploadFile(e.target.files?.[0])} disabled={busy} />
          <p className="help">PDF, DOCX, PNG/JPG screenshot, or TXT. Maximum 5 MB. Screenshots are read with OCR.</p>
          {busy && <p className="mt-2 flex items-center gap-2 text-xs text-slate-600"><Spinner /> Reading your file… OCR can take up to a minute.</p>}
        </div>
      ) : (
        <div>
          <label htmlFor="url-input" className="label">Web page address</label>
          <div className="flex gap-2">
            <input id="url-input" className="input" placeholder="https://example.com/pricing" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button type="button" className="btn-primary shrink-0" onClick={fetchUrl} disabled={busy || url.trim().length < 8}>
              {busy ? <Spinner /> : 'Fetch'}
            </button>
          </div>
          <p className="help">Only public pages can be fetched. Internal, private and local addresses are blocked for security.</p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3"><Alert tone="warning" title="Please check the extracted text">{warnings.join(' ')}</Alert></div>
      )}

      {preview && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Extracted text ({preview.chars} characters)</p>
            <span className="text-[11px] text-slate-500">{preview.kind}</span>
          </div>
          <textarea className="input mt-1.5 font-mono text-xs" rows={8} value={preview.text} onChange={(e) => setPreview({ ...preview, text: e.target.value, chars: e.target.value.length })} />
          <p className="help">Edit anything OCR or the page got wrong. Extracted text is treated as untrusted content — instructions inside it are never followed.</p>
        </div>
      )}
    </Modal>
  );
}
