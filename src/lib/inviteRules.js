// Invitation rules shared by the screens and tests. The database repeats the checks (queue_invites).

/** Invitation emails per hour. Supabase Auth allows 100; 10 stay free for sign-ups and password resets. Same as invite_hourly_budget(). */
export const INVITE_HOURLY_BUDGET = 90;
/** Above this many emails in a day, Gmail may start blocking the account. */
export const DAILY_EMAIL_WARNING = 300;
export const MAX_INVITES_PER_BATCH = 500;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reads a pasted list: one person per line, "email", "name, email" or "email, name" (comma, semicolon or tab).
 * A header line such as "name,email" is ignored. Returns { rows: [{ email, name }], problems: [{ line, text, reason }] }.
 */
export function parseInviteList(text) {
  const rows = [];
  const problems = [];
  const seen = new Set();
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (i === 0 && parts.some((p) => /^e-?mail$/i.test(p))) return;
    const emailPart = parts.find((p) => p.includes('@'));
    if (!emailPart) { problems.push({ line: i + 1, text: line, reason: 'No email address' }); return; }
    const email = emailPart.toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) { problems.push({ line: i + 1, text: line, reason: 'Not a valid email address' }); return; }
    if (seen.has(email)) { problems.push({ line: i + 1, text: line, reason: 'Listed twice' }); return; }
    seen.add(email);
    const name = parts.filter((p) => p !== emailPart).join(' ').slice(0, 60);
    rows.push({ email, name });
  });
  if (rows.length > MAX_INVITES_PER_BATCH) {
    problems.push({ line: null, text: '', reason: `Only ${MAX_INVITES_PER_BATCH} people can be invited at once. Split the list.` });
  }
  return { rows: rows.slice(0, MAX_INVITES_PER_BATCH), problems };
}

export const INVITE_STATUS = {
  queued: { label: 'Waiting to send', tone: 'muted' },
  sending: { label: 'Sending', tone: 'muted' },
  sent: { label: 'Sent, not accepted yet', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  enrolled: { label: 'Added (already had an account)', tone: 'success' },
  failed: { label: 'Not sent', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

/** What the instructor can do with an invitation. */
export function inviteActions(status) {
  return {
    retry: status === 'failed',
    resend: status === 'sent',
    cancel: ['queued', 'failed', 'sent'].includes(status),
  };
}

/** How many emails may go out now, and a warning when the day's total gets risky for Gmail. */
export function sendingPlan(stats, waiting) {
  const used = Number(stats?.sent_last_hour || 0);
  const budget = Number(stats?.budget || INVITE_HOURLY_BUDGET);
  const left = Math.max(0, budget - used);
  const today = Number(stats?.sent_today || 0);
  return {
    left,
    used,
    budget,
    sendNow: Math.min(left, waiting),
    later: Math.max(0, waiting - left),
    dailyWarning: today + waiting > DAILY_EMAIL_WARNING,
  };
}
