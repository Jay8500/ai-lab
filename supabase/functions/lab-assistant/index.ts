// "Ask AI" for lab admins & staff: answers questions about the lab's own numbers using the lab's AI key.
// The model sees an aggregate snapshot only — tokens, tests, counts, money, turnaround — never patient names or phones.
// Body: { question: string, history?: { role: 'user' | 'assistant', content: string }[] }
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
};

type Turn = { role: 'user' | 'assistant'; content: string };
interface Visit {
  token: string;
  created_at: string;
  status: string;
  amount: number | null;
  tests: { code: string; name: string; price?: number }[] | null;
  report_uploaded_at: string | null;
  delivered_at: string | null;
  age: number | null;
  gender: string | null;
  ai_values: { test: string; flag: string | null }[] | null;
}

const IST = (d: Date | string) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
const hours = (a: string, b: string) => Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3600000) * 10) / 10;

/** Compact numbers for the model; nothing that identifies a patient. */
function snapshot(lab: { name: string; test_catalog: unknown }, visits: Visit[]) {
  const now = new Date();
  const today = IST(now);
  const daily: Record<string, { visits: number; revenue: number; reports: number }> = {};
  const tests: Record<string, { name: string; count30d: number; revenue30d: number; tat: number[]; high: number; low: number }> = {};
  const status: Record<string, number> = {};
  const since30 = now.getTime() - 30 * 86400000;
  for (const v of visits) {
    const day = IST(v.created_at);
    const d = (daily[day] ??= { visits: 0, revenue: 0, reports: 0 });
    d.visits += 1;
    d.revenue += Number(v.amount ?? 0);
    if (v.report_uploaded_at) d.reports += 1;
    status[v.status] = (status[v.status] ?? 0) + 1;
    const recent = new Date(v.created_at).getTime() >= since30;
    for (const t of v.tests ?? []) {
      const s = (tests[t.code] ??= { name: t.name, count30d: 0, revenue30d: 0, tat: [], high: 0, low: 0 });
      if (recent) {
        s.count30d += 1;
        s.revenue30d += Number(t.price ?? 0);
      }
      if (v.report_uploaded_at) s.tat.push(hours(v.created_at, v.report_uploaded_at));
    }
    for (const r of v.ai_values ?? []) {
      const key = Object.keys(tests).find((k) => r.test.toLowerCase().includes(tests[k].name.toLowerCase().split(' ')[0])) ?? null;
      if (key && r.flag === 'high') tests[key].high += 1;
      if (key && r.flag === 'low') tests[key].low += 1;
    }
  }
  const pending = visits
    .filter((v) => !['ready', 'delivered'].includes(v.status))
    .slice(0, 40)
    .map((v) => ({ token: v.token, status: v.status, waiting_hours: hours(v.created_at, now.toISOString()), tests: (v.tests ?? []).map((t) => t.code).join(',') }));
  const readyNotDelivered = visits.filter((v) => v.status === 'ready').map((v) => v.token).slice(0, 40);
  return {
    lab: lab.name,
    today_ist: today,
    window: 'last 90 days',
    totals: { visits: visits.length, revenue: visits.reduce((s, v) => s + Number(v.amount ?? 0), 0) },
    by_status: status,
    daily: Object.entries(daily).sort(([a], [b]) => (a < b ? 1 : -1)).map(([day, d]) => ({ day, ...d })),
    tests: Object.entries(tests).map(([code, s]) => ({
      code, name: s.name, count_30d: s.count30d, revenue_30d: s.revenue30d,
      avg_turnaround_hours: s.tat.length ? Math.round((s.tat.reduce((a, b) => a + b, 0) / s.tat.length) * 10) / 10 : null,
      ai_flagged_high: s.high, ai_flagged_low: s.low,
    })),
    pending_reports: pending,
    ready_not_delivered: readyNotDelivered,
    patients: {
      gender: visits.reduce((m: Record<string, number>, v) => ((m[v.gender ?? 'unknown'] = (m[v.gender ?? 'unknown'] ?? 0) + 1), m), {}),
      age_groups: visits.reduce((m: Record<string, number>, v) => {
        const g = v.age == null ? 'unknown' : v.age < 18 ? '0-17' : v.age < 40 ? '18-39' : v.age < 60 ? '40-59' : '60+';
        m[g] = (m[g] ?? 0) + 1;
        return m;
      }, {}),
    },
    catalog: lab.test_catalog,
  };
}

const system = (data: unknown) => `You are the in-app assistant for a diagnostic lab's admins and front-desk staff, inside SpreadApps AI-Lab.
Answer questions about the lab's work using ONLY the data snapshot below (JSON). Dates are in IST; money is Indian rupees (write ₹ with Indian digit grouping).
- Be brief: a direct answer first, then up to 5 bullets if useful. Plain text, ** for bold, • for bullets.
- Do the arithmetic carefully from the numbers given. If the snapshot can't answer, say what is missing.
- You don't know patient names or phone numbers — refer to visits by token.
- No medical advice about individual patients. You may suggest practical operational ideas (staffing, turnaround, follow-ups).

<snapshot>
${JSON.stringify(data)}
</snapshot>`;

async function askClaude(apiKey: string, model: string, sys: string, turns: Turn[]): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: sys,
    messages: turns,
  } as never);
  const msg = response as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
  if (msg.stop_reason === 'refusal') throw new Error('The AI declined to answer that.');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
}

async function askOpenAI(apiKey: string, model: string, sys: string, turns: Turn[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, instructions: sys, input: turns }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  return ((await res.json()).output_text ?? '').trim();
}

async function askGemini(apiKey: string, model: string, sys: string, turns: Turn[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
}

function friendly(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The lab’s AI key was rejected — ask SpreadApps to check it.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'The lab’s AI key isn’t allowed to use this model.';
  if (e instanceof Anthropic.RateLimitError) return 'The AI provider is busy — try again in a minute.';
  if (e instanceof Anthropic.APIError) return 'The AI service had a problem — try again.';
  const m = (e as Error)?.message ?? '';
  if (/ 401| 403/.test(m)) return 'The lab’s AI key was rejected — ask SpreadApps to check it.';
  if (/ 429/.test(m)) return 'The AI provider is busy — try again in a minute.';
  return m.length < 120 ? m : 'Could not answer right now — try again.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Not signed in' }, 401);
  const { data: me } = await admin.from('profiles').select('role, tenant_id').eq('id', u.user.id).single();
  if (!me?.tenant_id || !['lab_owner', 'lab_staff'].includes(me.role)) return json({ error: 'Forbidden' }, 403);

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (question.length < 3) return json({ error: 'Type a question first.' }, 400);
  const history: Turn[] = (Array.isArray(body.history) ? body.history : [])
    .filter((t: Turn) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string')
    .slice(-6)
    .map((t: Turn) => ({ role: t.role, content: t.content.slice(0, 2000) }));
  // Turns must alternate and start with the user
  while (history.length && history[0].role !== 'user') history.shift();
  const turns: Turn[] = [];
  for (const t of [...history, { role: 'user' as const, content: question }]) {
    if (turns.length && turns[turns.length - 1].role === t.role) turns[turns.length - 1] = t;
    else turns.push(t);
  }

  const { data: lab } = await admin.from('tenants').select('name, pages, test_catalog').eq('id', me.tenant_id).single();
  if (lab?.pages?.show_ai === false) return json({ error: 'AI features are turned off for this lab.' }, 400);
  const { data: raw } = await admin.rpc('tenant_ai_config', { p_tenant: me.tenant_id });
  const provider = String(raw?.ai_provider ?? 'anthropic').toLowerCase().trim() || 'anthropic';
  const apiKey = String(raw?.ai_api_key ?? '').trim();
  if (!apiKey) return json({ error: 'AI isn’t set up for this lab yet — ask SpreadApps to add your AI key.' }, 400);
  if (!DEFAULT_MODEL[provider]) return json({ error: 'Unknown AI provider for this lab.' }, 400);
  const model = String(raw?.ai_model ?? '').trim() || DEFAULT_MODEL[provider];

  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: visits } = await admin
    .from('visits')
    .select('token, created_at, status, amount, tests, report_uploaded_at, delivered_at, age, gender, ai_values')
    .eq('tenant_id', me.tenant_id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3000);

  try {
    const sys = system(snapshot(lab!, (visits ?? []) as Visit[]));
    const answer =
      provider === 'openai' ? await askOpenAI(apiKey, model, sys, turns)
      : provider === 'gemini' ? await askGemini(apiKey, model, sys, turns)
      : await askClaude(apiKey, model, sys, turns);
    if (!answer) throw new Error('The AI returned an empty answer.');
    return json({ answer, model: `${provider}:${model}` });
  } catch (e) {
    console.error('lab-assistant failed', e);
    return json({ error: friendly(e) }, 400);
  }
});
