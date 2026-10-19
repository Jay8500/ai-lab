import { ResultFlag, ResultValue, TestItem, TestParam } from './models';

/** Reference range for this patient (female overrides when set). */
export function rangeFor(p: TestParam, sex: string | null | undefined): { low: number | null; high: number | null } {
  const f = sex === 'F';
  return {
    low: (f && p.low_f != null ? p.low_f : p.low) ?? null,
    high: (f && p.high_f != null ? p.high_f : p.high) ?? null,
  };
}

/** "12 – 15", "≤ 200"… — pass plain=true for PDFs (their built-in font has no ≤ / ≥). */
export function rangeLabel(p: TestParam, sex?: string | null, plain = false): string {
  if (p.type === 'text' || p.type === 'option') return '';
  const { low, high } = rangeFor(p, sex);
  if (low != null && high != null) return `${low} – ${high}`;
  if (low != null) return plain ? `${low} and above` : `≥ ${low}`;
  if (high != null) return plain ? `Up to ${high}` : `≤ ${high}`;
  return '';
}

export function flagFor(p: TestParam, n: number | null, sex?: string | null): ResultFlag {
  if (n === null || (p.type && p.type !== 'number')) return null;
  const { low, high } = rangeFor(p, sex);
  if (low != null && n < low) return 'low';
  if (high != null && n > high) return 'high';
  return low != null || high != null ? 'normal' : null;
}

/** Number from what the technician typed ("7,200" → 7200), or null. */
export function toNumber(v: string | null | undefined): number | null {
  const s = (v ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Evaluate a calculated parameter, e.g. "CHOL - HDL - TG / 5".
 * Only parameter keys, numbers, + - * / and brackets are allowed.
 */
export function evaluate(formula: string, values: Record<string, number | null>): number | null {
  const expr = formula.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (k) => {
    const v = values[k.toUpperCase()] ?? values[k];
    return v == null ? 'NaN' : `(${v})`;
  });
  if (!/^[\d\s.+\-*/()NaN]*$/.test(expr)) return null;
  try {
    const out = Function(`"use strict";return (${expr});`)() as number;
    return Number.isFinite(out) ? out : null;
  } catch {
    return null;
  }
}

/** Build stored values from what was typed, filling calculated params and flags. */
export function buildValues(test: TestItem, typed: Record<string, string>, sex?: string | null): Record<string, ResultValue> {
  const params = test.params ?? [];
  const nums: Record<string, number | null> = {};
  for (const p of params) if (!p.formula) nums[p.key.toUpperCase()] = toNumber(typed[p.key]);
  const out: Record<string, ResultValue> = {};
  for (const p of params) {
    let v = (typed[p.key] ?? '').trim();
    let n = p.type === 'text' || p.type === 'option' ? null : toNumber(v);
    if (p.formula) {
      n = evaluate(p.formula, nums);
      v = n === null ? '' : String(round(n, p.decimals ?? 2));
      if (n !== null) n = round(n, p.decimals ?? 2);
      nums[p.key.toUpperCase()] = n;
    }
    if (!v) continue;
    out[p.key] = { v, n, flag: flagFor(p, n, sex) };
  }
  return out;
}

export const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Every non-calculated parameter has a value. */
export function isComplete(test: TestItem, values: Record<string, ResultValue> | undefined): boolean {
  const need = (test.params ?? []).filter((p) => !p.formula);
  return need.length > 0 && need.every((p) => !!values?.[p.key]?.v);
}

export const FLAG_STYLE: Record<string, string> = {
  low: 'text-amber-600',
  high: 'text-rose-600',
  abnormal: 'text-rose-600',
  normal: 'text-emerald-600',
};
