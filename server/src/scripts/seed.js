/**
 * Seeds a clearly-labelled demo organisation with fictional data.
 * Everything created here is flagged isDemo:true and every record is tagged "(fictional)".
 * The demo org is separate from any real workspace, so demo analytics never mix with real ones.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { Organization, User, BrandFact, Guideline, Content, Review, AuditEvent, AiUsageLog } from '../models/index.js';
import {
  DEMO_FACTS, DEMO_GUIDELINES, DEMO_USERS, DEMO_PASSWORD, SAMPLE_CONTENT_BAD,
} from '../lib/demoBrand.js';
import { runCheck } from '../services/checkService.js';

const DEMO_ORG_SLUG = 'inkloom-demo';

export async function seedDemo({ reset = false } = {}) {
  if (reset) {
    const existing = await Organization.findOne({ slug: DEMO_ORG_SLUG });
    if (existing) {
      const orgId = existing._id;
      await Promise.all([
        User.deleteMany({ orgId }), BrandFact.deleteMany({ orgId }), Guideline.deleteMany({ orgId }),
        Content.deleteMany({ orgId }), Review.deleteMany({ orgId }), AuditEvent.deleteMany({ orgId }),
        AiUsageLog.deleteMany({ orgId }), Organization.deleteOne({ _id: orgId }),
      ]);
    }
  }

  let org = await Organization.findOne({ slug: DEMO_ORG_SLUG });
  if (org) return { org, created: false };

  org = await Organization.create({
    name: 'Inkloom AI (demo workspace)', slug: DEMO_ORG_SLUG, isDemo: true,
    aiProvider: config.aiProvider === 'openai' && config.aiApiKey ? 'openai' : 'none',
    confidentialMode: config.confidentialMode,
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = {};
  for (const u of DEMO_USERS) {
    users[u.role] = await User.create({ orgId: org._id, name: u.name, email: u.email, role: u.role, passwordHash, isDemo: true });
  }
  const manager = users.brand_manager;

  const facts = [];
  for (const f of DEMO_FACTS) {
    facts.push(await BrandFact.create({
      ...f, orgId: org._id, isDemo: true, createdBy: manager._id, status: 'approved', version: 1,
      history: [{ version: 1, statement: f.statement, value: f.value, sourceRef: f.sourceRef, changedBy: manager._id, changeNote: 'Initial approved version' }],
    }));
  }

  const guidelines = [];
  for (const g of DEMO_GUIDELINES) {
    guidelines.push(await Guideline.create({
      ...g, orgId: org._id, isDemo: true, createdBy: manager._id, status: 'active', version: 1,
      history: [{ version: 1, title: g.title, text: g.text, severity: g.severity, sourceRef: g.sourceRef, changedBy: manager._id, changeNote: 'Initial approved version' }],
    }));
  }

  /* ---------- A demo submission that has already been checked ---------- */
  const creator = users.creator;
  const demo = await Content.create({
    orgId: org._id, isDemo: true, title: 'Landing page draft — Inkloom AI Pro (demo)',
    channel: 'landing_page', body: SAMPLE_CONTENT_BAD, authorId: creator._id, status: 'draft',
    versions: [{ version: 1, body: SAMPLE_CONTENT_BAD, title: 'Landing page draft (demo)', by: creator._id, note: 'Seeded demo draft' }],
  });

  const result = await runCheck({
    org: org.toObject(), user: creator.toObject(), body: demo.body, channel: demo.channel,
  });
  demo.findings = result.findings;
  demo.lastCheck = {
    at: new Date(), mode: result.mode, engine: result.engine, aiUsed: result.aiUsed,
    totals: result.totals, factsConsidered: result.considered.facts, guidelinesConsidered: result.considered.guidelines,
  };
  await demo.save();

  /* ---------- Audit trail entries so the demo has real history ---------- */
  const audits = [
    ['fact.created', `${manager.name} approved ${facts.length} brand facts`],
    ['guideline.created', `${manager.name} approved ${guidelines.length} brand guidelines`],
    ['content.created', `${creator.name} created "${demo.title}"`],
    ['content.checked', `Checked "${demo.title}": ${result.totals.total} finding(s), ${result.mode}`],
  ];
  for (const [action, summary] of audits) {
    await AuditEvent.create({
      orgId: org._id, actorId: manager._id, actorName: manager.name, actorRole: 'brand_manager',
      action, summary, meta: { seeded: true }, at: new Date(Date.now() - Math.random() * 3600_000),
    });
  }

  return { org, users, created: true, demoContent: demo, findingCount: result.totals.total };
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isMain) {
  await mongoose.connect(config.mongoUri);
  const out = await seedDemo({ reset: process.argv.includes('--reset') });
  console.log(out.created
    ? `[seed] demo workspace created: ${out.org.name} (${out.findingCount} findings on the demo draft)`
    : '[seed] demo workspace already exists (use --reset to rebuild)');
  await mongoose.disconnect();
}
