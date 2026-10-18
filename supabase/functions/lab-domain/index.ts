// Keeps each lab's subdomain (<slug>.spreadapps.in) attached to the AI-Lab Netlify site.
// Secrets: NETLIFY_AUTH_TOKEN (personal access token), NETLIFY_SITE_ID
// Body: { action: 'add' | 'remove' | 'status', slug: string, old_slug?: string }
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const BASE = 'spreadapps.in';
const RESERVED = ['www', 'app', 'admin', 'lab', 'labs', 'ailab', 'ai-lab', 'circles', 'api'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Not signed in' }, 401);
  const { data: me } = await admin.from('profiles').select('role').eq('id', u.user.id).single();
  if (!me || !['super_admin', 'platform_admin'].includes(me.role)) return json({ error: 'Forbidden' }, 403);

  const token = Deno.env.get('NETLIFY_AUTH_TOKEN') ?? '';
  const siteId = Deno.env.get('NETLIFY_SITE_ID') ?? '';
  if (!token || !siteId) return json({ error: 'Automatic domains aren’t set up — add the subdomain in Netlify manually.', configured: false }, 400);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  const valid = (s: string) => /^[a-z0-9][a-z0-9-]{1,40}$/.test(s) && !RESERVED.includes(s);
  const slug = String(body.slug ?? '').toLowerCase();
  const oldSlug = String(body.old_slug ?? '').toLowerCase();
  if (!valid(slug)) return json({ error: 'Invalid subdomain' }, 400);
  const host = `${slug}.${BASE}`;

  const api = (path: string, init?: RequestInit) =>
    fetch(`https://api.netlify.com/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  const siteRes = await api(`/sites/${siteId}`);
  if (!siteRes.ok) return json({ error: `Netlify refused the request (${siteRes.status}) — check the token.` }, 400);
  const site = await siteRes.json();
  const aliases: string[] = site.domain_aliases ?? [];
  const isPrimary = site.custom_domain === host;

  if (action === 'status') return json({ configured: true, present: isPrimary || aliases.includes(host), host });

  let next = [...aliases];
  if (action === 'add') {
    if (oldSlug && valid(oldSlug) && oldSlug !== slug) next = next.filter((a) => a !== `${oldSlug}.${BASE}`);
    if (!isPrimary && !next.includes(host)) next.push(host);
  } else if (action === 'remove') {
    if (isPrimary) return json({ error: 'This is the site’s primary domain — change it in Netlify first.' }, 400);
    next = next.filter((a) => a !== host);
  } else {
    return json({ error: 'Unknown action' }, 400);
  }

  if (JSON.stringify(next) !== JSON.stringify(aliases)) {
    const upd = await api(`/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify({ domain_aliases: next }) });
    if (!upd.ok) return json({ error: `Netlify could not update domains (${upd.status}).` }, 400);
  }
  return json({ ok: true, host, aliases: next });
});
