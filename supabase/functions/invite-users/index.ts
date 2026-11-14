// Sends one queued invitation (public.invites). Deploy: Supabase Dashboard > Edge Functions, or `supabase functions deploy invite-users`.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase; set PUBLIC_APP_URL yourself.
// The service-role key stays on the server. The browser only sends { inviteId, resend }.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

/** Messages safe to show an instructor. Raw service errors stay in the function logs. */
function friendly(message: string): { text: string; requeue: boolean } {
  if (/rate limit|too many|429/i.test(message)) return { text: 'The hourly email limit was reached. It is sent automatically later.', requeue: true };
  if (/smtp|mail|sending/i.test(message)) return { text: 'The email could not be sent. Check the SMTP settings in Supabase (Authentication > Emails).', requeue: false };
  if (/redirect/i.test(message)) return { text: 'The sign-in link is not allowed. Add the app address under Authentication > URL Configuration.', requeue: false };
  return { text: 'The invitation could not be sent. Try again, or check the Edge Function logs.', requeue: false };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/+$/, '');
  if (!url || !anon || !serviceRole) return respond({ error: 'Server configuration is incomplete.' }, 503);
  if (!appUrl) return respond({ error: 'Set the PUBLIC_APP_URL secret of this Edge Function to the app address.' }, 503);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Authentication required.' }, 401);
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await caller.auth.getUser(authorization.slice(7));
  if (userError || !user) return respond({ error: 'Invalid session.' }, 401);
  const { data: me } = await caller.from('profiles').select('role,is_super_admin').eq('id', user.id).single();
  if (me?.role !== 'admin') return respond({ error: 'Instructor access required.' }, 403);

  const body = await request.json().catch(() => null);
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : '';
  const resend = body?.resend === true;
  if (!/^[0-9a-f-]{36}$/i.test(inviteId)) return respond({ error: 'Invalid invitation.' }, 400);

  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: invite } = await admin.from('invites').select('*').eq('id', inviteId).maybeSingle();
  if (!invite || (invite.invited_by !== user.id && !me.is_super_admin)) return respond({ error: 'Invitation not found.' }, 404);
  if (invite.role === 'admin' && !me.is_super_admin) return respond({ error: 'Only the super administrator can invite instructors.' }, 403);

  // Hourly budget, shared by every instructor (the Auth email limit is per project).
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: sentLastHour }, { data: budget }] = await Promise.all([
    admin.from('invites').select('id', { count: 'exact', head: true }).gt('sent_at', hourAgo),
    admin.rpc('invite_hourly_budget'),
  ]);
  if ((sentLastHour ?? 0) >= (budget ?? 90)) {
    const { data: oldest } = await admin.from('invites').select('sent_at').gt('sent_at', hourAgo).order('sent_at').limit(1).maybeSingle();
    const nextAt = oldest ? new Date(new Date(oldest.sent_at).getTime() + 3600_000).toISOString() : null;
    return respond({ status: 'waiting', nextAt, message: 'The hourly email budget is used up.' });
  }

  const { data: claimed } = await admin.rpc('claim_invite', { p_id: inviteId, p_resend: resend });
  if (!claimed?.length) return respond({ status: invite.status, message: 'This invitation is already handled.' });

  const finish = (fields: Record<string, unknown>) => admin.from('invites').update(fields).eq('id', inviteId);
  try {
    const { data: found, error: findError } = await admin.rpc('auth_user_by_email', { p_email: invite.email });
    if (findError) throw findError;
    const existing = found?.[0];
    if (existing?.last_sign_in_at) {
      // Already uses the app: add the courses, no email needed.
      const { error } = await admin.rpc('apply_invite', { p_id: inviteId, p_user: existing.id });
      if (error) throw error;
      await finish({ status: 'enrolled', user_id: existing.id });
      return respond({ status: 'enrolled' });
    }
    let userId = existing?.id as string | undefined;
    if (userId) {
      // Invited before but never signed in: send a "set your password" email instead.
      const { error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.resetPasswordForEmail(invite.email, { redirectTo: `${appUrl}/reset-password` });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(invite.email, {
        data: { display_name: invite.display_name || invite.email.split('@')[0] },
        redirectTo: `${appUrl}/reset-password`,
      });
      if (error) throw error;
      userId = data.user?.id;
    }
    if (!userId) throw new Error('No user id returned');
    const { error: applyError } = await admin.rpc('apply_invite', { p_id: inviteId, p_user: userId });
    if (applyError) throw applyError;
    await finish({ status: 'sent', user_id: userId, sent_at: new Date().toISOString() });
    return respond({ status: 'sent' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
    console.error('invite-users failed:', inviteId, message);
    const f = friendly(message);
    await finish({ status: f.requeue ? 'queued' : 'failed', last_error: f.text });
    return respond({ status: f.requeue ? 'waiting' : 'failed', error: f.text });
  }
});
