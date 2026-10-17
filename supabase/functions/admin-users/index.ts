// Creates / lists / removes lab users.
// super_admin: any tenant, roles lab_owner | lab_staff
// lab_owner:   own tenant only, role lab_staff
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: 'Not signed in' }, 401);

  const { data: me } = await admin.from('profiles').select('role, tenant_id').eq('id', userData.user.id).single();
  if (!me || (me.role !== 'super_admin' && me.role !== 'lab_owner')) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const tenantId: string | null = me.role === 'super_admin' ? body.tenant_id ?? null : me.tenant_id;
  if (!tenantId) return json({ error: 'tenant_id required' }, 400);

  if (action === 'list') {
    const { data, error } = await admin
      .from('profiles').select('id, email, full_name, role, created_at')
      .eq('tenant_id', tenantId).order('created_at');
    return error ? json({ error: error.message }, 400) : json({ users: data });
  }

  if (action === 'create') {
    const role = me.role === 'super_admin' ? (body.role === 'lab_owner' ? 'lab_owner' : 'lab_staff') : 'lab_staff';
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!email || password.length < 8) return json({ error: 'Email and an 8+ character password are required' }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: body.full_name ?? '' },
      app_metadata: { role, tenant_id: tenantId },
    });
    if (error) return json({ error: error.message }, 400);
    // trigger creates the profile; make sure role/tenant are right even if it already existed
    await admin.from('profiles').upsert({
      id: data.user.id, email, full_name: body.full_name ?? email.split('@')[0], role, tenant_id: tenantId,
    });
    return json({ user: { id: data.user.id, email, role } });
  }

  if (action === 'reset_password') {
    const password = String(body.password ?? '');
    if (password.length < 8) return json({ error: 'Password must be 8+ characters' }, 400);
    const { data: target } = await admin.from('profiles').select('tenant_id, role').eq('id', body.user_id).single();
    if (!target || target.tenant_id !== tenantId) return json({ error: 'User not in tenant' }, 404);
    const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (action === 'remove') {
    const { data: target } = await admin.from('profiles').select('tenant_id, role').eq('id', body.user_id).single();
    if (!target || target.tenant_id !== tenantId) return json({ error: 'User not in tenant' }, 404);
    if (me.role !== 'super_admin' && target.role !== 'lab_staff') return json({ error: 'Forbidden' }, 403);
    const { error } = await admin.auth.admin.deleteUser(body.user_id);
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
