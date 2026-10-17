// User management for every level of the hierarchy. All rules are enforced here (service role).
//
//   super_admin    → platform admins (scope "platform") + any lab's admins/staff
//   platform_admin → any lab's admins/staff
//   lab_owner      → own lab's admins/staff (cannot remove or demote themselves)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PLATFORM_ROLES = ['super_admin', 'platform_admin'];
const LAB_ROLES = ['lab_owner', 'lab_staff'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: 'Not signed in' }, 401);
  const meId = userData.user.id;

  const { data: me } = await admin.from('profiles').select('role, tenant_id').eq('id', meId).single();
  if (!me) return json({ error: 'Forbidden' }, 403);
  const isRoot = me.role === 'super_admin';
  const isPlatform = PLATFORM_ROLES.includes(me.role);
  const isLabAdmin = me.role === 'lab_owner';
  if (!isPlatform && !isLabAdmin) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  const scope = body.scope === 'platform' ? 'platform' : 'lab';

  if (scope === 'platform' && !isRoot) return json({ error: 'Only the super admin manages platform admins' }, 403);

  // Which tenant this request acts on (null = platform team)
  const tenantId: string | null = scope === 'platform' ? null : isPlatform ? body.tenant_id ?? null : me.tenant_id;
  if (scope === 'lab' && !tenantId) return json({ error: 'tenant_id required' }, 400);

  const allowedRoles = scope === 'platform' ? ['platform_admin'] : LAB_ROLES;

  const loadTarget = async (userId: string) => {
    const { data } = await admin.from('profiles').select('id, role, tenant_id').eq('id', userId).single();
    if (!data) return null;
    const inScope = scope === 'platform' ? data.role === 'platform_admin' : data.tenant_id === tenantId && LAB_ROLES.includes(data.role);
    return inScope ? data : null;
  };

  if (action === 'list') {
    let q = admin.from('profiles').select('id, email, full_name, role, title, created_at').order('created_at');
    q = scope === 'platform' ? q.in('role', PLATFORM_ROLES) : q.eq('tenant_id', tenantId!);
    const { data, error } = await q;
    return error ? json({ error: error.message }, 400) : json({ users: data });
  }

  if (action === 'create') {
    const role = allowedRoles.includes(body.role) ? body.role : allowedRoles[allowedRoles.length - 1];
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const fullName = String(body.full_name ?? '').trim() || email.split('@')[0];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) {
      return json({ error: 'A valid email and an 8+ character password are required' }, 400);
    }

    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { role, tenant_id: tenantId ?? '' },
    });
    if (error) return json({ error: error.message.includes('already') ? 'That email already has an account' : error.message }, 400);

    await admin.from('profiles').upsert({
      id: data.user.id, email, full_name: fullName, role, tenant_id: tenantId,
      title: body.title ? String(body.title) : null, created_by: meId,
    });
    return json({ user: { id: data.user.id, email, role } });
  }

  if (action === 'update') {
    const target = await loadTarget(body.user_id);
    if (!target) return json({ error: 'User not found' }, 404);
    const patch: Record<string, unknown> = {};
    if (body.full_name !== undefined) patch.full_name = String(body.full_name);
    if (body.title !== undefined) patch.title = body.title ? String(body.title) : null;
    if (body.role !== undefined && allowedRoles.includes(body.role)) {
      if (target.id === meId) return json({ error: 'You cannot change your own role' }, 400);
      patch.role = body.role;
    }
    const { error } = await admin.from('profiles').update(patch).eq('id', target.id);
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (action === 'reset_password') {
    const password = String(body.password ?? '');
    if (password.length < 8) return json({ error: 'Password must be 8+ characters' }, 400);
    const target = await loadTarget(body.user_id);
    if (!target) return json({ error: 'User not found' }, 404);
    const { error } = await admin.auth.admin.updateUserById(target.id, { password });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (action === 'remove') {
    if (body.user_id === meId) return json({ error: 'You cannot remove yourself' }, 400);
    const target = await loadTarget(body.user_id);
    if (!target) return json({ error: 'User not found' }, 404);
    const { error } = await admin.auth.admin.deleteUser(target.id);
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
