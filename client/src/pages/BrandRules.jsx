import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Loading, Spinner, Modal, EmptyState, fmtDate } from '../lib/ui.jsx';

const CAN_MANAGE = ['brand_manager'];

export default function BrandRules() {
  const { user } = useAuth();
  const [tab, setTab] = useState('facts');
  const [facts, setFacts] = useState([]);
  const [guidelines, setGuidelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // { kind:'fact'|'guideline', data }
  const canManage = CAN_MANAGE.includes(user.role);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [f, g] = await Promise.all([api.get('/brand/facts'), api.get('/brand/guidelines')]);
      setFacts(f.facts); setGuidelines(g.guidelines);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 5000); };

  if (loading) return <Loading label="Loading your brand rules…" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Brand rules</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          These are the approved facts and guidelines every content check is measured against. When you change a fact,
          the old version is kept so past findings and reviews still make sense.
        </p>
      </div>

      {error && <Alert tone="error" title="Could not load brand rules">{error}</Alert>}
      {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
      {!canManage && (
        <Alert tone="info" title="You have read-only access">
          Only a Brand manager can add or change brand facts and guidelines. Ask your brand manager if something needs updating.
        </Alert>
      )}

      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={tab === 'facts'} onClick={() => setTab('facts')}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'facts' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200'}`}>
          Approved facts ({facts.filter((f) => f.status === 'approved').length})
        </button>
        <button role="tab" aria-selected={tab === 'guidelines'} onClick={() => setTab('guidelines')}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === 'guidelines' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200'}`}>
          Guidelines ({guidelines.filter((g) => g.status === 'active').length})
        </button>
      </div>

      {tab === 'facts' ? (
        <section aria-label="Brand facts" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">A fact is a single approved statement, such as a price or a performance figure.</p>
            {canManage && <button className="btn-primary" onClick={() => setEditing({ kind: 'fact', data: null })}>+ Add fact</button>}
          </div>
          {facts.length === 0 ? (
            <EmptyState title="No facts yet" action={canManage && <button className="btn-primary" onClick={() => setEditing({ kind: 'fact', data: null })}>Add your first fact</button>}>
              Add approved statements like your prices, trial length or performance figures. Checks cannot verify numbers without them.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {facts.map((f) => (
                <li key={f._id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{f.label}</h3>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{f.key}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">v{f.version}</span>
                        <FreshnessBadge f={f.freshness} />
                        {f.status !== 'approved' && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{f.status}</span>}
                      </div>
                      <p className="mt-1.5 text-sm text-slate-800">{f.statement}</p>
                      <p className="mt-1 text-xs text-slate-500">Source: {f.sourceRef}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Effective {fmtDate(f.effectiveFrom)} · {f.expiresAt ? `expires ${fmtDate(f.expiresAt)}` : 'no expiry'} · {f.reviewBy ? `review by ${fmtDate(f.reviewBy)}` : 'no review date'}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-2">
                        <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing({ kind: 'fact', data: f })}>Edit</button>
                        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={async () => {
                          if (!confirm(`Retire "${f.label}"? Checks will stop using it, but the history is kept.`)) return;
                          try { await api.del(`/brand/facts/${f._id}`); await load(); flash('Fact retired. Its history is preserved.'); }
                          catch (e) { setError(e.message); }
                        }}>Retire</button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Guidelines" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">A guideline is a rule about how you communicate, such as banned phrases or required disclosures.</p>
            {canManage && <button className="btn-primary" onClick={() => setEditing({ kind: 'guideline', data: null })}>+ Add guideline</button>}
          </div>
          {guidelines.length === 0 ? (
            <EmptyState title="No guidelines yet" action={canManage && <button className="btn-primary" onClick={() => setEditing({ kind: 'guideline', data: null })}>Add your first guideline</button>}>
              Add rules such as “no superlatives without proof” or “always include the AI disclosure”.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {guidelines.map((g) => (
                <li key={g._id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{g.code}</span>
                        <h3 className="text-sm font-semibold text-slate-900">{g.title}</h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">v{g.version}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.severity === 'critical' ? 'bg-rose-100 text-rose-800' : g.severity === 'high' ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-900'}`}>{g.severity}</span>
                        <FreshnessBadge f={g.freshness} />
                      </div>
                      <p className="mt-1.5 text-sm text-slate-800">{g.text}</p>
                      {(g.forbidden?.length > 0 || g.requires?.length > 0) && (
                        <p className="mt-1 text-xs text-slate-500">
                          {g.forbidden?.length > 0 && <>Banned phrases: {g.forbidden.map((x) => `“${x}”`).join(', ')}. </>}
                          {g.requires?.length > 0 && <>Required text: “{g.requires[0]}”.</>}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">Source: {g.sourceRef}</p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-2">
                        <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing({ kind: 'guideline', data: g })}>Edit</button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <RuleDialog kind={editing.kind} data={editing.data} onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); await load(); flash(msg); }} />
      )}
    </div>
  );
}

function FreshnessBadge({ f }) {
  if (!f) return null;
  const styles = {
    ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    expiring: 'bg-amber-50 text-amber-900 ring-amber-200',
    expired: 'bg-rose-50 text-rose-800 ring-rose-200',
    overdue_review: 'bg-orange-50 text-orange-900 ring-orange-200',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${styles[f.status]}`}>{f.label}</span>;
}

function RuleDialog({ kind, data, onClose, onSaved }) {
  const isFact = kind === 'fact';
  const [form, setForm] = useState(() => ({
    key: data?.key || '', label: data?.label || '', statement: data?.statement || '', value: data?.value || '',
    category: data?.category || 'general', sourceRef: data?.sourceRef || '',
    expiresAt: data?.expiresAt ? String(data.expiresAt).slice(0, 10) : '',
    reviewBy: data?.reviewBy ? String(data.reviewBy).slice(0, 10) : '',
    code: data?.code || '', title: data?.title || '', text: data?.text || '',
    severity: data?.severity || 'medium',
    forbidden: (data?.forbidden || []).join('\n'), requires: (data?.requires || []).join('\n'),
    patterns: (data?.patterns || []).join(', '),
    appliesToChannel: (data?.appliesToChannel || []).join(', '),
  }));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setError(''); setErrors({}); setBusy(true);
    try {
      const payload = isFact ? {
        key: form.key.trim(), label: form.label.trim(), statement: form.statement.trim(),
        value: form.value.trim(), category: form.category.trim(), sourceRef: form.sourceRef.trim(),
        expiresAt: form.expiresAt || null, reviewBy: form.reviewBy || null,
      } : {
        code: form.code.trim(), title: form.title.trim(), text: form.text.trim(), category: 'claims',
        severity: form.severity, sourceRef: form.sourceRef.trim(),
        forbidden: form.forbidden.split('\n').map((s) => s.trim()).filter(Boolean),
        requires: form.requires.split('\n').map((s) => s.trim()).filter(Boolean),
        patterns: form.patterns.split(',').map((s) => s.trim()).filter(Boolean),
        appliesToChannel: form.appliesToChannel.split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (data) await api.put(`/brand/${isFact ? 'facts' : 'guidelines'}/${data._id}`, payload);
      else await api.post(`/brand/${isFact ? 'facts' : 'guidelines'}`, payload);
      onSaved(`${isFact ? 'Fact' : 'Guideline'} saved. New checks will use it immediately.`);
    } catch (e) { setError(e.message); if (e.details) setErrors(e.details); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`${data ? 'Edit' : 'Add'} ${isFact ? 'brand fact' : 'guideline'}`}
      footer={<>
        <button className="btn-secondary w-full sm:w-auto" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary w-full sm:w-auto" onClick={save} disabled={busy}>
          {busy ? <><Spinner /> Saving…</> : 'Save'}
        </button>
      </>}>
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {isFact ? (
        <div className="space-y-3">
          <div><label className="label">Short label</label><input className="input" value={form.label} onChange={set('label')} placeholder="Pro plan price (monthly)" />
            {errors.label && <p className="field-error">{errors.label}</p>}</div>
          <div><label className="label">Fact key</label><input className="input font-mono text-xs" value={form.key} onChange={set('key')} placeholder="price.pro" />
            <p className="help">Lowercase letters, numbers, dots or dashes. Must be unique.</p>{errors.key && <p className="field-error">{errors.key}</p>}</div>
          <div><label className="label">Approved statement</label><textarea className="input" rows={3} value={form.statement} onChange={set('statement')} placeholder="The approved price of the Pro plan is ₹2,499 per user per month." />
            <p className="help">Write the exact, approved wording. This is the evidence shown to reviewers.</p>{errors.statement && <p className="field-error">{errors.statement}</p>}</div>
          <div><label className="label">Key value (optional)</label><input className="input" value={form.value} onChange={set('value')} placeholder="₹2,499 per user per month" />
            <p className="help">Helps the checker compare numbers precisely.</p></div>
          <div><label className="label">Source reference</label><input className="input" value={form.sourceRef} onChange={set('sourceRef')} placeholder="Brand Book §3 Pricing, approved 2026-08-01" />
            <p className="help">Where this fact is approved. Reviewers rely on this.</p>{errors.sourceRef && <p className="field-error">{errors.sourceRef}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Expires on</label><input type="date" className="input" value={form.expiresAt} onChange={set('expiresAt')} /><p className="help">Optional.</p></div>
            <div><label className="label">Review by</label><input type="date" className="input" value={form.reviewBy} onChange={set('reviewBy')} /><p className="help">Optional.</p></div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Code</label><input className="input font-mono text-xs" value={form.code} onChange={set('code')} placeholder="GL-SUP-01" />{errors.code && <p className="field-error">{errors.code}</p>}</div>
            <div><label className="label">Severity</label><select className="input" value={form.severity} onChange={set('severity')}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select></div>
          </div>
          <div><label className="label">Title</label><input className="input" value={form.title} onChange={set('title')} placeholder="No unsupported superlatives" />{errors.title && <p className="field-error">{errors.title}</p>}</div>
          <div><label className="label">Rule text</label><textarea className="input" rows={3} value={form.text} onChange={set('text')} placeholder="Content must not describe the product as “the best” unless an approved benchmark is cited." />
            {errors.text && <p className="field-error">{errors.text}</p>}</div>
          <div><label className="label">Banned phrases (one per line)</label><textarea className="input" rows={2} value={form.forbidden} onChange={set('forbidden')} placeholder="better than Jasper" /></div>
          <div><label className="label">Required text (one per line)</label><textarea className="input" rows={2} value={form.requires} onChange={set('requires')} placeholder="Outputs are AI-generated and should be reviewed by a human." /></div>
          <div><label className="label">Source reference</label><input className="input" value={form.sourceRef} onChange={set('sourceRef')} placeholder="Brand Voice Guide §5.1" />{errors.sourceRef && <p className="field-error">{errors.sourceRef}</p>}</div>
          <div><label className="label">Only applies to channels (optional)</label><input className="input" value={form.appliesToChannel} onChange={set('appliesToChannel')} placeholder="landing_page, email" /><p className="help">Comma separated. Leave empty for all channels.</p></div>
        </div>
      )}
    </Modal>
  );
}
