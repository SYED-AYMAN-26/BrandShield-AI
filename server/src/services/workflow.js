/**
 * The workflow state machine. Every transition is validated here, on the server.
 * Frontend buttons are only a mirror of these rules.
 */
export const TRANSITIONS = {
  draft: ['in_review'],
  in_review: ['changes_requested', 'approved', 'rejected'],
  changes_requested: ['in_review'],
  approved: [],
  rejected: ['in_review'],
};

export const ROLE_FOR_TRANSITION = {
  'draft->in_review': ['creator', 'brand_manager'],
  'changes_requested->in_review': ['creator', 'brand_manager'],
  'rejected->in_review': ['creator', 'brand_manager'],
  'in_review->changes_requested': ['reviewer', 'brand_manager'],
  'in_review->approved': ['approver', 'brand_manager'],
  'in_review->rejected': ['approver', 'brand_manager'],
};

export function assertTransition(from, to, role) {
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return { ok: false, message: `Content cannot move from "${label(from)}" to "${label(to)}".` };
  }
  const roles = ROLE_FOR_TRANSITION[`${from}->${to}`] || [];
  if (!roles.includes(role)) {
    return { ok: false, message: `Only a ${roles.join(' or ')} can move content from "${label(from)}" to "${label(to)}". You are signed in as ${role}.` };
  }
  return { ok: true };
}

export const label = (s) => ({
  draft: 'Draft', in_review: 'In review', changes_requested: 'Changes requested',
  approved: 'Approved', rejected: 'Rejected',
}[s] || s);

export const STATUS_HELP = {
  draft: 'You can edit freely. Nothing has been sent to a reviewer yet.',
  in_review: 'A reviewer is looking at this. You cannot edit until they respond.',
  changes_requested: 'The reviewer asked for changes. Edit the content, then submit it again.',
  approved: 'An approver accepted this content. It is ready to publish.',
  rejected: 'An approver rejected this content. You can revise and resubmit it.',
};
