import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const FAQ = [
  ['What does BrandShield AI actually do?', 'It compares your marketing text with the brand facts and guidelines your team has approved, and lists every place they disagree. Each issue shows the exact sentence, the approved source, and a suggested correction.'],
  ['Does it use AI?', 'The checking itself uses fixed brand rules, which gives the same answer every time. External AI is optional and switched off by default. When it is on, it can only add a finding if it quotes your text word-for-word and cites an approved brand source — anything else is thrown away.'],
  ['Can it be wrong?', 'Yes. It only knows what your brand facts and guidelines say. If a fact is missing or out of date, it will miss issues or flag things unfairly. That is why a reviewer must always approve content before publishing.'],
  ['Why does a finding say “needs human review” instead of “wrong”?', 'Because the checker cannot prove the claim is false. It means a person must decide. We never label something as a lie without an approved source that contradicts it.'],
  ['What does “needs human review” on an expired fact mean?', 'One of your approved facts has passed its expiry date. The checker will not use an expired fact to judge your content, so a person has to confirm the current figure first.'],
  ['Why do I need to run a check before submitting?', 'So the reviewer can see the specific issues instead of reading from scratch. It also means the approval decision is based on evidence.'],
  ['What happens when content is rejected?', 'It goes back to you with a reason. You can edit it, check it again and resubmit. Nothing is lost — the full history is kept.'],
  ['Who can do what?', 'Creators write and submit content. Reviewers accept or dismiss findings, comment, and request changes. Approvers give the final approval or rejection. Brand managers manage brand facts and guidelines and can do all of the above. These rules are enforced by the server, not just hidden in the interface.'],
  ['Is my content sent anywhere?', 'No, unless an administrator turns on external AI assistance. When it is on, obvious personal and secret data is redacted first, and you can preview exactly what would be sent from the Insights area. Confidential Mode blocks all external calls.'],
  ['Can I upload a PDF or a screenshot?', 'Yes. Upload a PDF, DOCX, PNG or JPG, or paste a public web page address. Text is read from it, and you can edit the extracted text before checking.'],
];

export default function Help() {
  const { user } = useAuth();
  const [open, setOpen] = useState(0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Help and how it works</h1>
        <p className="mt-1 text-sm text-slate-600">A short guide for first-time users. No technical knowledge needed.</p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900">The three steps</h2>
        <ol className="mt-3 space-y-3">
          {[
            ['Add your content', 'Paste the text, upload a file, or paste a web page address. Give it a name you will recognise.'],
            ['Check it against your brand rules', 'Press Check Content. You get a list of issues. Each one shows the exact sentence, the approved fact or guideline it breaks, why it matters, and how to fix it.'],
            ['Fix it and get it approved', 'Use Fix this for me where available, or edit the sentence. Then Submit for Review. A reviewer comments or requests changes, and an approver gives the final sign-off.'],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{t}</p>
                <p className="text-sm text-slate-600">{b}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/content/new" className="btn-primary">Check content now</Link>
          <Link to="/content" className="btn-secondary">See existing content</Link>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900">The words we use</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ['Brand fact', 'A single approved statement, such as a price, trial length or performance figure.'],
            ['Guideline', 'A rule about how you write, such as a banned phrase or a required disclosure.'],
            ['Finding', 'One issue the checker found in your content.'],
            ['Confirmed conflict', 'The content directly contradicts an approved fact or breaks an approved rule.'],
            ['Unsupported claim', 'The content claims something no approved source backs up. It may be true, but it is unproven.'],
            ['Needs human review', 'The checker cannot decide this. A person must confirm it.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg bg-slate-50 p-3">
              <dt className="text-sm font-semibold text-slate-900">{t}</dt>
              <dd className="mt-0.5 text-xs text-slate-600">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card divide-y divide-slate-100">
        <h2 className="px-5 py-4 text-sm font-semibold text-slate-900">Common questions</h2>
        {FAQ.map(([q, a], i) => (
          <div key={q}>
            <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
              aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
              <span className="text-sm font-medium text-slate-900">{q}</span>
              <span aria-hidden="true" className="text-slate-400">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <p className="px-5 pb-4 text-sm text-slate-600">{a}</p>}
          </div>
        ))}
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-900">Your role: {user.role.replace('_', ' ')}</h2>
        <p className="mt-1 text-sm text-slate-600">{
          {
            creator: 'You write content, run checks, fix issues and send content for review. You cannot approve your own content.',
            reviewer: 'You read findings, accept or dismiss them with a reason, comment, and request changes. You cannot give final approval.',
            approver: 'You give the final approval or rejection once a reviewer has responded. You cannot edit content.',
            brand_manager: 'You manage brand facts and guidelines, review ambiguity proposals, and can perform every workflow step.',
          }[user.role]
        }</p>
      </section>

      <p className="text-xs text-slate-500">
        Still stuck? Open the Activity log to see exactly what happened, or ask a Brand manager in your workspace.
      </p>
    </div>
  );
}
