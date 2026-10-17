// SpreadApps → labs email announcements via Resend.
// Secret required:  supabase secrets set RESEND_API_KEY=re_xxx
// Only SpreadApps admins (super_admin / platform_admin) may call this.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const NO_EMAIL_DOMAIN = 'no-email.spreadapps.in';
const BASE_DOMAIN = 'spreadapps.in';
const LOGO = 'https://spreadapps-ai-lab.netlify.app/brand/spreadapps-icon.png';
const CATEGORY: Record<string, { label: string; color: string }> = {
  general: { label: 'Update', color: '#6366F1' },
  payment: { label: 'Payment', color: '#D97706' },
  feature: { label: 'New feature', color: '#059669' },
  maintenance: { label: 'Maintenance', color: '#DC2626' },
  trial: { label: 'Your trial', color: '#7C3AED' },
};

interface Audience {
  roles?: string[];
  statuses?: string[];
  tenant_ids?: string[];
}
interface Recipient {
  email: string;
  name: string;
  lab: string;
  slug: string;
  plan: string;
  trial_end: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function fill(text: string, r: Recipient): string {
  return text
    .replaceAll('{{name}}', r.name)
    .replaceAll('{{lab}}', r.lab)
    .replaceAll('{{plan}}', r.plan)
    .replaceAll('{{trial_end}}', r.trial_end)
    .replaceAll('{{lab_url}}', `https://${r.slug}.${BASE_DOMAIN}`);
}

/** Plain text with **bold** and links → safe HTML paragraphs. */
function toHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => {
      let h = esc(p.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#4F46E5">$1</a>');
      return `<p style="margin:0 0 14px;line-height:1.6">${h}</p>`;
    })
    .join('');
}

function template(subject: string, body: string, category: string, footer: string): string {
  const c = CATEGORY[category] ?? CATEGORY.general;
  return `<!doctype html><html><body style="margin:0;background:#F1F5F9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#334155">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
<tr><td style="padding:20px 24px;border-bottom:1px solid #F1F5F9">
  <img src="${LOGO}" width="28" height="28" alt="" style="vertical-align:middle">
  <span style="font-weight:800;font-size:16px;color:#0F172A;vertical-align:middle;margin-left:8px">SpreadApps <span style="color:#6366F1">AI-Lab</span></span>
  <span style="float:right;background:${c.color}1A;color:${c.color};font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px">${c.label}</span>
</td></tr>
<tr><td style="padding:24px">
  <h1 style="margin:0 0 16px;font-size:20px;color:#0F172A">${esc(subject)}</h1>
  ${toHtml(body)}
</td></tr>
<tr><td style="padding:16px 24px;background:#F8FAFC;font-size:12px;color:#94A3B8">${esc(footer)}<br>© SpreadApps · <a href="https://${BASE_DOMAIN}" style="color:#94A3B8">${BASE_DOMAIN}</a></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Not signed in' }, 401);
  const { data: me } = await admin.from('profiles').select('role, email, full_name').eq('id', u.user.id).single();
  if (!me || !['super_admin', 'platform_admin'].includes(me.role)) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const { data: setting } = await admin.from('platform_settings').select('value').eq('key', 'email').maybeSingle();
  const cfg = { from_name: 'SpreadApps', from_email: 'updates@spreadapps.in', reply_to: '', footer: '', ...(setting?.value ?? {}) };
  const from = `${cfg.from_name} <${cfg.from_email}>`;

  if (action === 'status') return json({ configured: !!apiKey, from, reply_to: cfg.reply_to });

  // ── Who would receive it ──
  async function recipients(a: Audience): Promise<{ list: Recipient[]; skipped: number }> {
    const roles = a.roles?.length ? a.roles.filter((r) => ['lab_owner', 'lab_staff'].includes(r)) : ['lab_owner'];
    let q = admin.from('profiles').select('email, full_name, username, tenant_id').in('role', roles).not('tenant_id', 'is', null);
    if (a.tenant_ids?.length) q = q.in('tenant_id', a.tenant_ids);
    const [{ data: people }, { data: labs }, { data: plans }] = await Promise.all([
      q,
      admin.from('tenants').select('id, name, slug, status, plan_id, trial_started_at, trial_days'),
      admin.from('plans').select('id, name'),
    ]);
    const labMap = new Map((labs ?? []).map((t) => [t.id, t]));
    const planMap = new Map((plans ?? []).map((p) => [p.id, p.name]));
    const seen = new Set<string>();
    let skipped = 0;
    const list: Recipient[] = [];
    for (const p of people ?? []) {
      const t = labMap.get(p.tenant_id);
      if (!t) continue;
      const trialEnd = new Date(new Date(t.trial_started_at).getTime() + t.trial_days * 86_400_000);
      const effective = t.status === 'trial' && trialEnd.getTime() < Date.now() ? 'expired' : t.status;
      if (a.statuses?.length && !a.statuses.includes(effective)) continue;
      const email = String(p.email ?? '').toLowerCase();
      if (!email || email.endsWith('@' + NO_EMAIL_DOMAIN)) {
        skipped++;
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      list.push({
        email,
        name: (p.full_name || p.username || 'there').split(' ')[0],
        lab: t.name,
        slug: t.slug,
        plan: planMap.get(t.plan_id) ?? 'your plan',
        trial_end: trialEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      });
    }
    return { list, skipped };
  }

  async function sendBatch(items: { to: string; subject: string; html: string }[]) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(items.map((i) => ({ from, to: [i.to], subject: i.subject, html: i.html, ...(cfg.reply_to ? { reply_to: cfg.reply_to } : {}) }))),
    });
    if (!res.ok) throw new Error(`Email provider error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  if (action === 'recipients') {
    const { list, skipped } = await recipients(body.audience ?? {});
    return json({ count: list.length, skipped, sample: list.slice(0, 8).map((r) => ({ name: r.name, lab: r.lab })) });
  }

  const subject = String(body.subject ?? '').trim();
  const text = String(body.body ?? '').trim();
  const category = CATEGORY[body.category] ? String(body.category) : 'general';
  if (subject.length < 3 || subject.length > 150) return json({ error: 'Subject must be 3–150 characters' }, 400);
  if (text.length < 10 || text.length > 10000) return json({ error: 'Message must be 10–10,000 characters' }, 400);
  if (!apiKey) return json({ error: 'Email is not set up yet — add the Resend API key first' }, 400);

  if (action === 'test') {
    const to = String(me.email ?? '');
    if (!to || to.endsWith('@' + NO_EMAIL_DOMAIN)) return json({ error: 'Your account has no email address' }, 400);
    const sample: Recipient = { email: to, name: (me.full_name || 'there').split(' ')[0], lab: 'Sri Sai Diagnostics', slug: 'srisai-diagnostics', plan: 'Growth', trial_end: new Date().toLocaleDateString('en-IN') };
    try {
      await sendBatch([{ to, subject: '[Test] ' + fill(subject, sample), html: template(fill(subject, sample), fill(text, sample), category, cfg.footer) }]);
      return json({ ok: true, to });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  if (action === 'send') {
    const audience: Audience = body.audience ?? {};
    const { list, skipped } = await recipients(audience);
    if (!list.length) return json({ error: 'No recipients with an email address match this audience' }, 400);
    const { data: row, error: insErr } = await admin
      .from('announcements')
      .insert({ category, subject, body: text, audience, recipients: list.length, skipped_no_email: skipped, created_by: u.user.id })
      .select('id')
      .single();
    if (insErr) return json({ error: insErr.message }, 400);

    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      try {
        await sendBatch(chunk.map((r) => ({ to: r.email, subject: fill(subject, r), html: template(fill(subject, r), fill(text, r), category, cfg.footer) })));
        sent += chunk.length;
      } catch (e) {
        failed += chunk.length;
        lastError = (e as Error).message;
      }
    }
    const status = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial';
    await admin.from('announcements').update({ sent, failed, status, error: lastError, sent_at: new Date().toISOString() }).eq('id', row.id);
    return json({ ok: failed === 0, sent, failed, skipped, status, error: lastError });
  }

  return json({ error: 'Unknown action' }, 400);
});
