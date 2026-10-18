// Emails the SpreadApps owner about new demo requests from the sales page.
// Called (no body needed) right after a lead is submitted. Only leads from the last
// 30 minutes that haven't been alerted yet are sent, so calling it repeatedly can't spam.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return json({ ok: false });

  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: leads } = await admin.from('support_tickets').select('id, summary, details, created_at')
    .eq('kind', 'lead').is('alerted_at', null).gte('created_at', since).limit(5);
  if (!leads?.length) return json({ ok: true, sent: 0 });

  // Send to the SpreadApps owner (super admin) account's email
  const { data: owner } = await admin.from('profiles').select('id').eq('role', 'super_admin').limit(1).single();
  const { data: u } = owner ? await admin.auth.admin.getUserById(owner.id) : { data: null };
  const to = u?.user?.email;
  if (!to) return json({ ok: false });
  const { data: es } = await admin.from('platform_settings').select('value').eq('key', 'email').maybeSingle();
  const from = `${es?.value?.from_name || 'SpreadApps'} <${es?.value?.from_email || 'updates@mail.spreadapps.in'}>`;

  let sent = 0;
  for (const l of leads) {
    const phone = (l.details.match(/Phone: ([+\d]+)/) ?? [])[1] ?? '';
    const wa = phone ? `https://wa.me/${phone.replace(/^\+/, '').replace(/^(?!91)(\d{10})$/, '91$1')}` : '';
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
      <h2 style="margin:0 0 8px;color:#4f46e5">🎉 New demo request</h2>
      <pre style="font-family:inherit;white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px">${esc(l.details)}</pre>
      ${wa ? `<p><a href="${wa}" style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Reply on WhatsApp</a></p>` : ''}
      <p style="color:#64748b">Also in AI-Lab admin → Support → Demo requests: https://ailab.spreadapps.in/admin/support</p></div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: l.summary, html }),
    });
    if (res.ok) {
      sent += 1;
      await admin.from('support_tickets').update({ alerted_at: new Date().toISOString() }).eq('id', l.id);
    }
  }
  return json({ ok: true, sent });
});
