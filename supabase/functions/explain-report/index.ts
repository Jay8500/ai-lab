// AI report explanation for one visit, using the lab's own AI key (stored in Vault).
// Called automatically after a report PDF is uploaded, and by the "Explain with AI" button.
// Body: { visit_id: string }
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

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

const MARKER = '===VALUES===';

const SYSTEM = `You explain medical laboratory reports to patients in India in clear, simple English.
Rules:
- Use only what is written in the report. Never invent values, ranges or tests.
- Explain what each test measures in one short line, then whether the result is within, above or below the reference range printed on the report.
- Do not diagnose, do not name diseases the patient "has", and do not suggest medicines or doses.
- If a value is far outside its range, say calmly that it should be shown to a doctor soon.
- Do not include the patient's name, phone number or any ID.
- Keep the explanation under 300 words. Friendly, reassuring, factual.
Format exactly like this (plain text, ** for bold, • for bullets, blank line between sections):
**Overall**
One or two sentences.

**Your results**
• Test name — value (unit): what it measures. Within / above / below the normal range.

**What to do next**
• One to three short, practical points (e.g. discuss with your doctor, repeat test if advised).

After the explanation, on its own line write exactly ${MARKER} and then a JSON array with every numeric result printed on the report:
[{"test": "name as printed", "value": 13.2, "unit": "g/dL", "low": 13, "high": 17, "flag": "low" | "normal" | "high"}]
Use null for a missing range limit. Copy numbers exactly from the report; skip results that are not numbers. Write nothing after the JSON.`;

interface AiConfig {
  provider: string;
  apiKey: string;
  model: string;
}

async function explainWithClaude(cfg: AiConfig, pdfB64: string, prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  // Server-side refusal fallback: if this model declines on safety grounds, the API
  // re-runs the request on a fallback Claude model inside the same call.
  const response = await client.beta.messages.create({
    model: cfg.model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  } as never);
  const msg = response as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
  if (msg.stop_reason === 'refusal') throw new Error('The AI declined to explain this report.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  if (!text) throw new Error('The AI returned an empty explanation.');
  return text;
}

async function explainWithOpenAI(cfg: AiConfig, pdfB64: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      instructions: SYSTEM,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: 'report.pdf', file_data: `data:application/pdf;base64,${pdfB64}` },
            { type: 'input_text', text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  const text = (data.output_text as string | undefined)?.trim();
  if (!text) throw new Error('The AI returned an empty explanation.');
  return text;
}

async function explainWithGemini(cfg: AiConfig, pdfB64: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: pdfB64 } }, { text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
  if (!text) throw new Error('The AI returned an empty explanation.');
  return text;
}

interface ReportValue {
  test: string;
  value: number;
  unit: string | null;
  low: number | null;
  high: number | null;
  flag: 'low' | 'normal' | 'high' | null;
}

/** Split the model output into the patient explanation and the numeric values (for trends). */
function splitOutput(raw: string): { summary: string; values: ReportValue[] | null } {
  const i = raw.indexOf(MARKER);
  if (i < 0) return { summary: raw.trim(), values: null };
  const summary = raw.slice(0, i).trim();
  const num = (x: unknown) =>
    typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null;
  try {
    const body = raw.slice(i + MARKER.length);
    const arr = JSON.parse(body.slice(body.indexOf('['), body.lastIndexOf(']') + 1));
    if (!Array.isArray(arr)) return { summary, values: null };
    const values = arr
      .map((r: Record<string, unknown>) => ({
        test: String(r.test ?? '').trim().slice(0, 80),
        value: num(r.value),
        unit: r.unit ? String(r.unit).trim().slice(0, 20) : null,
        low: num(r.low),
        high: num(r.high),
        flag: (['low', 'normal', 'high'].includes(String(r.flag)) ? r.flag : null) as ReportValue['flag'],
      }))
      .filter((r): r is ReportValue => !!r.test && r.value !== null)
      .slice(0, 80);
    return { summary, values: values.length ? values : null };
  } catch {
    return { summary, values: null };
  }
}

/** Short, user-safe error text stored on the visit. */
function friendly(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The lab’s AI key was rejected — check it in API keys.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'The lab’s AI key isn’t allowed to use this model.';
  if (e instanceof Anthropic.RateLimitError) return 'The AI provider is busy — try again in a minute.';
  if (e instanceof Anthropic.BadRequestError) return 'The AI could not read this PDF.';
  if (e instanceof Anthropic.APIError) return 'The AI service had a problem — try again.';
  const m = (e as Error)?.message ?? '';
  if (/ 401| 403/.test(m)) return 'The lab’s AI key was rejected — check it in API keys.';
  if (/ 429/.test(m)) return 'The AI provider is busy — try again in a minute.';
  return m.length < 120 ? m : 'Could not create the explanation — try again.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'Not signed in' }, 401);
  const { data: me } = await admin.from('profiles').select('role, tenant_id').eq('id', u.user.id).single();

  const { visit_id } = await req.json().catch(() => ({}));
  if (!visit_id) return json({ error: 'visit_id required' }, 400);
  const { data: v } = await admin.from('visits').select('id, tenant_id, tests, age, gender, report_path, ai_status').eq('id', visit_id).single();
  if (!v) return json({ error: 'Visit not found' }, 404);

  const allowed = me && (['super_admin', 'platform_admin'].includes(me.role) || (['lab_owner', 'lab_staff'].includes(me.role) && me.tenant_id === v.tenant_id));
  if (!allowed) return json({ error: 'Forbidden' }, 403);
  if (!v.report_path) return json({ error: 'Upload the report PDF first' }, 400);

  const setStatus = (patch: Record<string, unknown>) => admin.from('visits').update(patch).eq('id', v.id);

  const { data: raw } = await admin.rpc('tenant_ai_config', { p_tenant: v.tenant_id });
  const provider = String(raw?.ai_provider ?? 'anthropic').toLowerCase().trim() || 'anthropic';
  const apiKey = String(raw?.ai_api_key ?? '').trim();
  if (!apiKey) {
    const msg = 'AI isn’t set up for this lab yet — add an AI key in the lab’s API keys.';
    await setStatus({ ai_status: 'error', ai_error: msg });
    return json({ error: msg }, 400);
  }
  if (!DEFAULT_MODEL[provider]) {
    const msg = 'Unknown AI provider — use anthropic, openai or gemini.';
    await setStatus({ ai_status: 'error', ai_error: msg });
    return json({ error: msg }, 400);
  }
  const cfg: AiConfig = { provider, apiKey, model: String(raw?.ai_model ?? '').trim() || DEFAULT_MODEL[provider] };

  await setStatus({ ai_status: 'pending', ai_error: null });
  try {
    const { data: file, error: dlErr } = await admin.storage.from('reports').download(v.report_path);
    if (dlErr || !file) throw new Error('Could not open the report PDF.');
    const pdfB64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));

    const tests = (v.tests ?? []).map((t: { code: string; name: string }) => `${t.name} (${t.code})`).join(', ');
    const prompt = `Explain this lab report for the patient.${v.age ? ` Patient age: ${v.age}.` : ''}${v.gender ? ` Sex: ${v.gender}.` : ''} Tests ordered: ${tests || 'see report'}.`;

    const raw =
      provider === 'openai' ? await explainWithOpenAI(cfg, pdfB64, prompt)
      : provider === 'gemini' ? await explainWithGemini(cfg, pdfB64, prompt)
      : await explainWithClaude(cfg, pdfB64, prompt);

    const { summary, values } = splitOutput(raw);
    if (!summary) throw new Error('The AI returned an empty explanation.');
    // Verified results entered in AI-Lab are exact — never replace them with values read from the PDF
    const { count: verified } = await admin.from('test_results').select('id', { count: 'exact', head: true }).eq('visit_id', v.id).eq('status', 'verified');
    await setStatus({ ai_status: 'done', ai_summary: summary, ...(verified ? {} : { ai_values: values }), ai_error: null, ai_generated_at: new Date().toISOString(), ai_model: `${provider}:${cfg.model}` });
    return json({ ok: true });
  } catch (e) {
    console.error('explain-report failed', e);
    const msg = friendly(e);
    await setStatus({ ai_status: 'error', ai_error: msg });
    return json({ error: msg }, 400);
  }
});
