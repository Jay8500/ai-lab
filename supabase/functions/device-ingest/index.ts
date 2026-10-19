// Analyzer results → AI-Lab. Accepts ASTM (E1394 / LIS2-A2) or HL7 v2 ORU messages, or simple JSON.
//
// Who can call:
//   • a lab's connector program:  Authorization: Bearer sadev_…   (device key from Lab → Devices)
//   • the "Send test message" simulator: a signed-in lab admin / super admin with { device_id, simulate: true }
//
// Body: text/plain raw message, or JSON { message } / { results: [{ sample, code, value, unit?, flag? }] }
// Results land in test_results as status 'entered' (source 'device'); a person still verifies them.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

interface Raw { sample: string; code: string; value: string; unit?: string; flag?: string }
interface Param { key: string; name: string; unit?: string; type?: string; low?: number | null; high?: number | null; low_f?: number | null; high_f?: number | null }
interface Test { code: string; name: string; params?: Param[] }

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Strip ASTM framing (STX + frame no., ETX/ETB + checksum, ENQ/ACK/EOT) and split into records. */
function lines(text: string): string[] {
  return text
    .replace(/\x02\d?/g, '\n')
    .replace(/[\x03\x17][0-9A-Fa-f]{2}/g, '\n')
    .replace(/[\x04\x05\x06\x15]/g, '')
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseAstm(text: string): Raw[] {
  const out: Raw[] = [];
  let sample = '';
  for (const l of lines(text)) {
    const f = l.split('|');
    const type = f[0].replace(/^\d/, '').toUpperCase();
    if (type === 'O') sample = (f[2] || f[3] || '').split('^')[0].trim();
    if (type === 'R' && sample) {
      const comps = (f[2] ?? '').split('^');
      const code = (comps[3] || comps.filter(Boolean).pop() || '').trim();
      const value = (f[3] ?? '').split('^')[0].trim();
      if (code && value) out.push({ sample, code, value, unit: (f[4] ?? '').trim() || undefined, flag: (f[6] ?? '').trim() || undefined });
    }
  }
  return out;
}

function parseHl7(text: string): Raw[] {
  const out: Raw[] = [];
  let sample = '';
  for (const l of lines(text)) {
    const f = l.split('|');
    const seg = f[0].toUpperCase();
    if (seg === 'OBR') sample = ((f[3] || f[2] || '').split('^')[0]).trim();
    if (seg === 'SPM' && !sample) sample = ((f[2] || '').split('^')[0]).trim();
    if (seg === 'OBX' && sample) {
      const code = (f[3] ?? '').split('^')[0].trim();
      const value = (f[5] ?? '').trim();
      if (code && value) out.push({ sample, code, value, unit: ((f[6] ?? '').split('^')[0]).trim() || undefined, flag: (f[8] ?? '').trim() || undefined });
    }
  }
  return out;
}

/** "SRS-1018-004" or a tube label like "SRS-1018-004-E" → the visit token. */
const tokenOf = (sample: string) => (sample.toUpperCase().match(/[A-Z]{1,5}-\d{4}-\d{3}/) ?? [null])[0];

function flagFor(p: Param | undefined, n: number | null, sex: string | null, deviceFlag?: string): string | null {
  if (n !== null && p) {
    const low = sex === 'F' && p.low_f != null ? p.low_f : p.low;
    const high = sex === 'F' && p.high_f != null ? p.high_f : p.high;
    if (low != null && n < low) return 'low';
    if (high != null && n > high) return 'high';
    if (low != null || high != null) return 'normal';
  }
  const d = (deviceFlag ?? '').toUpperCase();
  if (/^L/.test(d)) return 'low';
  if (/^H/.test(d)) return 'high';
  if (d === 'N') return 'normal';
  if (d === 'A') return 'abnormal';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const ctype = req.headers.get('content-type') ?? '';
  const bodyText = await req.text();
  let body: Record<string, unknown> = {};
  if (ctype.includes('json')) {
    try { body = JSON.parse(bodyText); } catch { return json({ error: 'Invalid JSON' }, 400); }
  }

  // ── Who is sending? ──
  let device: Record<string, unknown> | null = null;
  let simulated = false;
  if (auth.startsWith('sadev_')) {
    const { data } = await admin.from('lab_devices').select('*').eq('key_hash', await sha256(auth)).maybeSingle();
    if (!data) return json({ error: 'Unknown device key' }, 401);
    if (!data.active) return json({ error: 'This device is switched off in AI-Lab' }, 403);
    device = data;
  } else {
    const { data: u } = await admin.auth.getUser(auth);
    if (!u?.user) return json({ error: 'Not signed in' }, 401);
    const { data: me } = await admin.from('profiles').select('role, tenant_id').eq('id', u.user.id).single();
    const { data: d } = await admin.from('lab_devices').select('*').eq('id', String(body.device_id ?? '')).maybeSingle();
    if (!d) return json({ error: 'Device not found' }, 404);
    const ok = me && (['super_admin', 'platform_admin'].includes(me.role) || (me.role === 'lab_owner' && me.tenant_id === d.tenant_id));
    if (!ok) return json({ error: 'Forbidden' }, 403);
    device = d;
    simulated = true;
  }
  const tenantId = String(device!.tenant_id);
  const protocol = String(device!.protocol);

  // ── Parse ──
  const message = typeof body.message === 'string' ? body.message : ctype.includes('json') ? '' : bodyText;
  let raw: Raw[] = [];
  try {
    if (Array.isArray(body.results)) {
      raw = (body.results as Raw[]).map((r) => ({ sample: String(r.sample ?? ''), code: String(r.code ?? ''), value: String(r.value ?? ''), unit: r.unit, flag: r.flag }));
    } else {
      const looksHl7 = /^\s*(\x0b)?MSH\|/.test(message);
      raw = protocol === 'hl7' || looksHl7 ? parseHl7(message) : parseAstm(message);
    }
  } catch (e) {
    raw = [];
    console.error('parse failed', e);
  }

  const log = async (status: string, summary: unknown, error?: string) =>
    admin.from('device_messages').insert({ tenant_id: tenantId, device_id: device!.id, raw: (message || bodyText).slice(0, 20000), summary, status, error, simulated });
  await admin.from('lab_devices').update({ last_message_at: new Date().toISOString() }).eq('id', device!.id);

  if (!raw.length) {
    await log('error', null, 'No results found in the message');
    return json({ error: 'No results found in the message', received: true }, 422);
  }

  // ── Match & save ──
  const { data: lab } = await admin.from('tenants').select('test_catalog').eq('id', tenantId).single();
  const catalog = (lab?.test_catalog ?? []) as Test[];
  const mapping = (device!.mapping ?? []) as { device_code: string; test_code: string; param_key: string }[];
  const matched: string[] = [];
  const unmatched: string[] = [];
  const skipped: string[] = [];
  const byVisit = new Map<string, { visit: Record<string, unknown>; tests: Map<string, Record<string, unknown>> }>();

  for (const r of raw) {
    const token = tokenOf(r.sample);
    if (!token) { unmatched.push(`${r.sample}: ${r.code} (no token)`); continue; }
    let entry = [...byVisit.values()].find((x) => x.visit.token === token);
    if (!entry) {
      const { data: v } = await admin.from('visits').select('id, token, gender, tests, status').eq('tenant_id', tenantId).ilike('token', token).maybeSingle();
      if (!v) { unmatched.push(`${token}: ${r.code} (no such visit)`); continue; }
      entry = { visit: v, tests: new Map() };
      byVisit.set(v.id, entry);
    }
    const visitTests = (entry.visit.tests ?? []) as Test[];
    // 1) explicit mapping  2) a parameter key equal to the device code in one of the visit's tests
    const m = mapping.find((x) => x.device_code.toUpperCase() === r.code.toUpperCase());
    let testCode = m?.test_code ?? null;
    let paramKey = m?.param_key ?? null;
    if (!testCode) {
      for (const t of visitTests) {
        const def = catalog.find((c) => c.code === t.code);
        const p = def?.params?.find((x) => x.key.toUpperCase() === r.code.toUpperCase());
        if (p) { testCode = t.code; paramKey = p.key; break; }
      }
    }
    if (!testCode || !paramKey || !visitTests.some((t) => t.code === testCode)) {
      unmatched.push(`${token}: ${r.code} (not mapped${testCode ? ' / test not ordered' : ''})`);
      continue;
    }
    const def = catalog.find((c) => c.code === testCode)?.params?.find((p) => p.key === paramKey);
    const n = Number(r.value.replace(/,/g, ''));
    const num = r.value.trim() !== '' && Number.isFinite(n) ? n : null;
    const values = entry.tests.get(testCode) ?? {};
    values[paramKey] = { v: r.value, n: num, flag: flagFor(def, num, String(entry.visit.gender ?? ''), r.flag) };
    entry.tests.set(testCode, values);
    matched.push(`${token}: ${testCode}.${paramKey} = ${r.value}`);
  }

  for (const { visit, tests } of byVisit.values()) {
    for (const [testCode, values] of tests) {
      const { data: cur } = await admin.from('test_results').select('id, status, "values"').eq('visit_id', visit.id).eq('test_code', testCode).maybeSingle();
      if (cur?.status === 'verified') { skipped.push(`${visit.token}: ${testCode} already verified`); continue; }
      const merged = { ...(cur?.values ?? {}), ...values };
      const row = { tenant_id: tenantId, visit_id: visit.id, test_code: testCode, values: merged, status: 'entered', source: 'device', device_id: device!.id };
      const res = cur ? await admin.from('test_results').update(row).eq('id', cur.id) : await admin.from('test_results').insert(row);
      if (res.error) unmatched.push(`${visit.token}: ${testCode} (${res.error.message})`);
    }
    if (visit.status === 'collected') await admin.from('visits').update({ status: 'in_lab' }).eq('id', visit.id);
  }

  const status = matched.length && !unmatched.length ? 'matched' : matched.length ? 'partial' : 'unmatched';
  const summary = { results: raw.length, matched, unmatched, skipped };
  await log(status, summary);
  return json({ ok: true, status, ...summary });
});
