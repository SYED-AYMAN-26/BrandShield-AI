import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const orgScoped = { orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true } };
const ts = { timestamps: true };

/* ---------- Organization ---------- */
const orgSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  isDemo: { type: Boolean, default: false },
  confidentialMode: { type: Boolean, default: false },
  aiProvider: { type: String, enum: ['none', 'openai'], default: 'none' },
  settings: { type: Schema.Types.Mixed, default: {} },
}, ts);
export const Organization = model('Organization', orgSchema);

/* ---------- User ---------- */
export const ROLES = ['creator', 'reviewer', 'approver', 'brand_manager'];
const userSchema = new Schema({
  ...orgScoped,
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, required: true, index: true },
  isDemo: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
  failedLogins: { type: Number, default: 0 },
  lockedUntil: Date,
}, ts);
userSchema.index({ orgId: 1, role: 1 });
export const User = model('User', userSchema);

/* ---------- Brand fact (versioned, organisation scoped) ---------- */
const factVersionSchema = new Schema({
  version: { type: Number, required: true },
  statement: String, value: String, sourceRef: String,
  effectiveFrom: Date, expiresAt: Date, reviewBy: Date,
  status: { type: String, enum: ['draft', 'approved', 'retired'], default: 'approved' },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  changedAt: { type: Date, default: Date.now },
  changeNote: String,
}, { _id: false });

const factSchema = new Schema({
  ...orgScoped,
  key: { type: String, required: true, trim: true, lowercase: true }, // e.g. "price.pro", "claim.uptime"
  label: { type: String, required: true, trim: true },
  statement: { type: String, required: true, maxlength: 2000 },
  value: { type: String, maxlength: 500 },      // canonical machine-checkable value
  aliases: [{ type: String }],                  // alternate phrasings that are acceptable
  category: { type: String, default: 'general' },
  sourceRef: { type: String, required: true, maxlength: 1000 }, // where this fact is approved from
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['draft', 'approved', 'retired'], default: 'approved' },
  effectiveFrom: { type: Date, default: Date.now },
  expiresAt: Date,
  reviewBy: Date,
  isDemo: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  history: [factVersionSchema],
}, ts);
factSchema.index({ orgId: 1, key: 1 }, { unique: true });
export const BrandFact = model('BrandFact', factSchema);

/* ---------- Guideline (versioned) ---------- */
const guidelineVersionSchema = new Schema({
  version: { type: Number, required: true },
  title: String, text: String, severity: String, sourceRef: String,
  changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  changedAt: { type: Date, default: Date.now },
  changeNote: String,
}, { _id: false });

const guidelineSchema = new Schema({
  ...orgScoped,
  code: { type: String, required: true, trim: true }, // e.g. "GL-SUP-01"
  title: { type: String, required: true, maxlength: 200 },
  text: { type: String, required: true, maxlength: 3000 },
  category: { type: String, default: 'claims' },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  sourceRef: { type: String, required: true, maxlength: 1000 },
  patterns: [{ type: String, maxlength: 200 }], // deterministic trigger phrases / regexes
  forbidden: [{ type: String, maxlength: 200 }],
  requires: [{ type: String, maxlength: 200 }], // one of these must appear (e.g. disclosure text)
  // Without this field Mongoose silently discarded it, so a landing-page-only rule applied to
  // every channel and produced 35 false alarms in the live evaluation.
  appliesToChannel: [{ type: String, enum: ['landing_page', 'email', 'social', 'ad', 'blog', 'other'] }],
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['draft', 'active', 'retired'], default: 'active' },
  effectiveFrom: { type: Date, default: Date.now },
  reviewBy: Date,
  isDemo: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  history: [guidelineVersionSchema],
}, ts);
guidelineSchema.index({ orgId: 1, code: 1 }, { unique: true });
export const Guideline = model('Guideline', guidelineSchema);

/* ---------- Content / submission ---------- */
export const CONTENT_STATUS = ['draft', 'in_review', 'changes_requested', 'approved', 'rejected'];
const findingSchema = new Schema({
  type: { type: String, enum: ['conflict', 'unsupported_claim', 'possible_issue', 'needs_human_review'], required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  ruleId: String,
  guidelineId: { type: Schema.Types.ObjectId, ref: 'Guideline' },
  guidelineCode: String,
  guidelineVersion: Number,
  factId: { type: Schema.Types.ObjectId, ref: 'BrandFact' },
  factKey: String,
  factVersion: Number,
  excerpt: { type: String, required: true },        // verbatim text from the submission
  excerptVerified: { type: Boolean, default: false },
  evidence: { type: String, required: true },        // verbatim approved source text / guideline text
  evidenceSource: String,                            // sourceRef of the approved source
  evidenceVerified: { type: Boolean, default: false },
  explanation: { type: String, required: true },
  whyItMatters: String,
  suggestedFix: { type: String, required: true },
  autoFix: { type: { find: String, replace: String, description: String }, default: null },
  confidence: { type: Number, min: 0, max: 1, default: 1 },
  source: { type: String, enum: ['rule', 'ai'], default: 'rule' },
  status: { type: String, enum: ['open', 'accepted', 'dismissed', 'fixed'], default: 'open' },
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  decidedAt: Date,
  decisionReason: String,
}, { _id: true });

const contentVersionSchema = new Schema({
  version: { type: Number, required: true },
  body: { type: String, required: true },
  title: String,
  by: { type: Schema.Types.ObjectId, ref: 'User' },
  at: { type: Date, default: Date.now },
  note: String,
  findingsSummary: { total: Number, bySeverity: Schema.Types.Mixed },
}, { _id: false });

const contentSchema = new Schema({
  ...orgScoped,
  title: { type: String, required: true, trim: true, maxlength: 200 },
  channel: { type: String, enum: ['landing_page', 'email', 'social', 'ad', 'blog', 'other'], default: 'other' },
  body: { type: String, required: true, maxlength: 20000 },
  status: { type: String, enum: CONTENT_STATUS, default: 'draft', index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  version: { type: Number, default: 1 },
  versions: [contentVersionSchema],
  findings: [findingSchema],
  lastCheck: {
    at: Date, mode: String, engine: String, aiUsed: Boolean,
    totals: Schema.Types.Mixed, factsConsidered: Number, guidelinesConsidered: Number,
  },
  extraction: { kind: String, filename: String, url: String, chars: Number, at: Date, warnings: [String] },
  reviewId: { type: Schema.Types.ObjectId, ref: 'Review' },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedReason: String,
  isDemo: { type: Boolean, default: false },
}, ts);
contentSchema.index({ orgId: 1, status: 1, updatedAt: -1 });
export const Content = model('Content', contentSchema);

/* ---------- Review ---------- */
const reviewSchema = new Schema({
  ...orgScoped,
  contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true, index: true },
  contentVersion: Number,
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewerId: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'in_progress', 'changes_requested', 'approved', 'rejected'], default: 'pending' },
  comments: [{
    by: { type: Schema.Types.ObjectId, ref: 'User' }, byName: String, body: String,
    findingId: { type: Schema.Types.ObjectId }, at: { type: Date, default: Date.now },
  }],
  decisions: [{
    findingId: { type: Schema.Types.ObjectId }, action: { type: String, enum: ['accepted', 'dismissed'] },
    reason: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, byName: String, at: Date,
  }],
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  decidedAt: Date,
  decisionNote: String,
}, ts);
export const Review = model('Review', reviewSchema);

/* ---------- Audit ---------- */
const auditSchema = new Schema({
  ...orgIdField(),
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  actorRole: String,
  action: { type: String, required: true },
  entityType: String,
  entityId: String,
  summary: String,
  meta: Schema.Types.Mixed,
  ip: String,
  at: { type: Date, default: Date.now, index: true },
}, { timestamps: false });
function orgIdField() {
  return { orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true } };
}
auditSchema.index({ orgId: 1, at: -1 });
export const AuditEvent = model('AuditEvent', auditSchema);

/* ---------- AI gateway usage log ---------- */
const aiLogSchema = new Schema({
  ...orgScoped,
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  purpose: String,
  provider: String,
  model: String,
  status: { type: String, enum: ['success', 'error', 'blocked', 'skipped'], required: true },
  blockedReason: String,
  redactions: { type: [{ kind: String, count: Number }], default: [] },
  inputChars: Number,
  outputChars: Number,
  latencyMs: Number,
  promptHash: String,          // sha256 of the redacted prompt; raw prompt is never stored
  errorMessage: String,
  at: { type: Date, default: Date.now },
}, ts);
aiLogSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
export const AiUsageLog = model('AiUsageLog', aiLogSchema);

/* ---------- Guideline ambiguity proposals ---------- */
const suggestionSchema = new Schema({
  ...orgScoped,
  guidelineId: { type: Schema.Types.ObjectId, ref: 'Guideline', required: true },
  detectorVersion: String,
  signals: [{ label: String, detail: String, weight: Number }],
  decisionEvidence: [{
    reviewId: Schema.Types.ObjectId, findingId: Schema.Types.ObjectId, action: String,
    reason: String, byName: String, at: Date,
  }],
  stats: { dismissals: Number, acceptances: Number, totalDecisions: Number, dismissRate: Number },
  status: { type: String, enum: ['open', 'accepted', 'edited', 'rejected'], default: 'open' },
  proposedText: String,
  finalText: String,
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  decidedAt: Date,
  decisionNote: String,
}, ts);
export const GuidelineSuggestion = model('GuidelineSuggestion', suggestionSchema);

/* ---------- Evaluation runs ---------- */
const evalRunSchema = new Schema({
  ...orgScoped,
  name: String,
  mode: { type: String, enum: ['rule', 'ai'], default: 'rule' },
  datasetVersion: String,
  at: { type: Date, default: Date.now },
  metrics: Schema.Types.Mixed,
  perExample: [{ id: String, expected: [String], predicted: [String], tp: Number, fp: Number, fn: Number }],
}, ts);
export const EvaluationRun = model('EvaluationRun', evalRunSchema);
