import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ReportValue } from '../core/models';

/** One visit's numbers, as read from the report by the AI. */
export interface TrendSource {
  at: string;
  token: string;
  values: ReportValue[] | null | undefined;
}

export interface TrendPoint {
  at: string;
  token: string;
  value: number;
  flag: ReportValue['flag'];
}

export interface TrendSeries {
  key: string;
  test: string;
  unit: string | null;
  low: number | null;
  high: number | null;
  points: TrendPoint[]; // oldest → newest
}

/** "Haemoglobin (Hb)" and "Hemoglobin" are the same test. */
const norm = (s: string) =>
  s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/haem/g, 'hem').replace(/oe/g, 'e').replace(/[^a-z0-9]/g, '');

/** Tests measured in two or more visits, abnormal ones first. */
export function buildTrends(sources: TrendSource[]): TrendSeries[] {
  const map = new Map<string, TrendSeries>();
  const sorted = [...sources].filter((s) => s.values?.length).sort((a, b) => (a.at < b.at ? -1 : 1));
  for (const s of sorted) {
    for (const v of s.values!) {
      const key = norm(v.test) + '|' + (v.unit ?? '').toLowerCase().replace(/\s/g, '');
      if (!norm(v.test)) continue;
      const series = map.get(key) ?? { key, test: v.test, unit: v.unit, low: v.low, high: v.high, points: [] };
      // one point per visit
      if (series.points.at(-1)?.token === s.token) continue;
      series.points.push({ at: s.at, token: s.token, value: v.value, flag: v.flag });
      series.test = v.test;
      series.low = v.low ?? series.low;
      series.high = v.high ?? series.high;
      map.set(key, series);
    }
  }
  const out = [...map.values()].filter((s) => s.points.length >= 2);
  const bad = (s: TrendSeries) => (s.points.at(-1)!.flag && s.points.at(-1)!.flag !== 'normal' ? 0 : 1);
  return out.sort((a, b) => bad(a) - bad(b) || a.test.localeCompare(b.test));
}

const W = 132;
const H = 40;
const PAD = 4;

/** Small multiples: one sparkline per test with the normal range shaded. */
@Component({
  selector: 'app-trends',
  imports: [LucideAngularModule, DatePipe, DecimalPipe],
  template: `
    <ul class="divide-y divide-slate-100">
      @for (s of shown(); track s.key) {
        @let last = s.points[s.points.length - 1];
        @let prev = s.points[s.points.length - 2];
        <li class="py-3">
          <div class="flex items-baseline gap-3">
            <p class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{{ s.test }}</p>
            <p class="shrink-0 text-sm font-bold tabular-nums" [class]="valueTone(last.flag)">{{ last.value | number: '1.0-2' }} <span class="text-[10px] font-medium text-slate-400">{{ s.unit }}</span></p>
          </div>
          <div class="mt-1 flex items-center gap-3">
          <div class="min-w-0 flex-1 text-xs text-slate-400">
            <p class="flex items-center gap-0.5 whitespace-nowrap tabular-nums">
              <lucide-icon [name]="last.value > prev.value ? 'arrow-up' : last.value < prev.value ? 'arrow-down' : 'minus'" class="size-3" />
              {{ last.value - prev.value > 0 ? '+' : '' }}{{ last.value - prev.value | number: '1.0-2' }} since {{ prev.at | date: 'MMM d' }}
            </p>
            <p>
              {{ s.points.length }} visits since {{ s.points[0].at | date: 'MMM y' }}
              @if (s.low !== null || s.high !== null) { · normal {{ rangeLabel(s) }} }
            </p>
          </div>
          <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="h-10 w-[120px] shrink-0 overflow-visible sm:w-[132px]" aria-hidden="true">
            @if (geo(s); as g) {
              @if (g.band) {
                <rect x="0" [attr.y]="g.band.y" [attr.width]="w" [attr.height]="g.band.h" rx="3" class="fill-emerald-100/70" />
              }
              <polyline [attr.points]="g.line" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" class="text-slate-400" />
              @for (p of g.dots; track $index) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="$last ? 3.5 : 2.5" [class]="dotTone(p.flag)"><title>{{ p.label }}</title></circle>
              }
            }
          </svg>
          </div>
        </li>
      }
    </ul>
    @if (series().length > limit()) {
      <button type="button" class="mt-2 text-xs font-semibold text-brand hover:underline" (click)="all.set(!all())">
        {{ all() ? 'Show fewer' : 'Show all ' + series().length + ' tests' }}
      </button>
    }
  `,
})
export class Trends {
  readonly series = input.required<TrendSeries[]>();
  readonly limit = input(6);
  protected readonly all = signal(false);
  protected readonly w = W;
  protected readonly h = H;
  protected readonly shown = computed(() => (this.all() ? this.series() : this.series().slice(0, this.limit())));

  rangeLabel(s: TrendSeries) {
    if (s.low !== null && s.high !== null) return `${s.low}–${s.high}`;
    return s.low !== null ? `≥ ${s.low}` : `≤ ${s.high}`;
  }

  geo(s: TrendSeries) {
    const vals = s.points.map((p) => p.value);
    const lo = Math.min(...vals, s.low ?? Infinity);
    const hi = Math.max(...vals, s.high ?? -Infinity);
    const span = hi - lo || Math.abs(hi) || 1;
    const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
    const x = (i: number) => PAD + (i / (s.points.length - 1)) * (W - PAD * 2);
    const dots = s.points.map((p, i) => ({ x: x(i), y: y(p.value), flag: p.flag, label: `${p.value} ${s.unit ?? ''} · ${new Date(p.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` }));
    const band =
      s.low !== null || s.high !== null
        ? (() => {
            const top = y(s.high ?? hi);
            const bottom = y(s.low ?? lo);
            return { y: Math.min(top, bottom), h: Math.max(2, Math.abs(bottom - top)) };
          })()
        : null;
    return { dots, band, line: dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ') };
  }

  dotTone(flag: ReportValue['flag']) {
    return flag === 'high' ? 'fill-rose-500' : flag === 'low' ? 'fill-amber-500' : flag === 'normal' ? 'fill-emerald-500' : 'fill-slate-400';
  }

  valueTone(flag: ReportValue['flag']) {
    return flag === 'high' ? 'text-rose-600' : flag === 'low' ? 'text-amber-600' : 'text-slate-800';
  }
}
