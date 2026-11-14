// Deploy with: supabase functions deploy admin-invite-student
// Uses Supabase-managed server secrets; NEVER expose the service-role key to React.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!url || !anon || !serviceRole) return respond({ error: 'Server configuration is incomplete.' }, 503);
    if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Authentication required.' }, 401);
    const jwt = authorization.slice(7);
    const callerClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser(jwt);
    if (userError || !user) return respond({ error: 'Invalid session.' }, 401);
    const { data: profile, error: roleError } = await callerClient.from('profiles')
      .select('role').eq('id', user.id).single();
    if (roleError || profile?.role !== 'admin') return respond({ error: 'Admin access required.' }, 403);

    const raw = await request.json().catch(() => null);
    const email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : '';
    const displayName = typeof raw?.displayName === 'string' ? raw.displayName.trim() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond({ error: 'Enter a valid student email.' }, 400);
    if (displayName.length > 60) return respond({ error: 'Student name must be 60 characters or fewer.' }, 400);

    const adminClient = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const redirectBase = Deno.env.get('PUBLIC_APP_URL')?.replace(/\/+$/, '');
    const options = {
      data: { display_name: displayName || email.split('@')[0] },
      ...(redirectBase ? { redirectTo: `${redirectBase}/reset-password` } : {}),
    };
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, options);
    if (error) {
      // Keep underlying service errors out of the browser; the server keeps diagnostics.
      console.error('Student invitation failed:', error.message);
      return respond({ error: 'Could not send the invitation. Check SMTP settings or whether the account already exists.' }, 400);
    }
    return respond({ message: 'Student invitation sent.', userId: data.user?.id ?? null });
  } catch (error) {
    console.error('Student invitation server error:', error);
    return respond({ error: 'Invitation could not be processed.' }, 500);
  }
});
