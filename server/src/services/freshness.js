/**
 * Fact / guideline freshness, computed from stored dates and the real runtime clock.
 * Nothing here is cached or hard-coded.
 */
const DAY = 864e5;

export function freshness(item, now = new Date()) {
  const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
  const reviewBy = item.reviewBy ? new Date(item.reviewBy) : null;
  const daysToExpiry = expiresAt ? Math.floor((expiresAt - now) / DAY) : null;
  const daysToReview = reviewBy ? Math.floor((reviewBy - now) / DAY) : null;

  let status = 'ok';
  if (expiresAt && expiresAt <= now) status = 'expired';
  else if (expiresAt && daysToExpiry <= 30) status = 'expiring';
  else if (reviewBy && reviewBy <= now) status = 'overdue_review';

  return {
    status,
    daysToExpiry,
    daysToReview,
    expiresAt,
    reviewBy,
    label: {
      ok: 'Current',
      expiring: `Expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`,
      expired: `Expired ${Math.abs(daysToExpiry)} day${Math.abs(daysToExpiry) === 1 ? '' : 's'} ago`,
      overdue_review: `Review overdue by ${Math.abs(daysToReview)} day${Math.abs(daysToReview) === 1 ? '' : 's'}`,
    }[status],
  };
}

export function summarizeFreshness(items, now = new Date()) {
  const rows = items.map((i) => ({ ...i, freshness: freshness(i, now) }));
  const counts = { ok: 0, expiring: 0, expired: 0, overdue_review: 0 };
  for (const r of rows) counts[r.freshness.status] += 1;
  return { rows, counts, checkedAt: now };
}
