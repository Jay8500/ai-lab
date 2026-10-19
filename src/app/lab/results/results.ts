import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { DialogService } from '../../core/dialog.service';
import { LabService } from '../../core/lab.service';
import { TestItem, TestParam, TestResult, Visit } from '../../core/models';
import { buildValues, FLAG_STYLE, flagFor, isComplete, rangeLabel, toNumber } from '../../core/results';
import { ResultsService } from '../../core/results.service';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { StatusPill } from '../../shared/status-pill';

type Typed = Record<string, Record<string, string>>;

/** Technician result entry → pathologist verification → automatic report. */
@Component({
  selector: 'app-lab-results',
  imports: [FormsModule, LucideAngularModule, DatePipe, StatusPill, RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Results</h1>
        <p class="text-sm text-slate-500">Enter or review values, verify, and the report is created automatically.</p>
      </div>
      @if (!results.canVerify()) {
        <span class="pill border-slate-200 bg-slate-50 text-slate-500"><lucide-icon name="info" class="size-3.5" /> A lab admin or pathologist verifies</span>
      }
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
      <!-- Worklist -->
      <aside class="card h-fit p-3" [class.hidden]="!!open() && narrow()" >
        <div class="relative">
          <lucide-icon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input class="input py-2! pl-9!" placeholder="Token, name or mobile" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </div>
        <div class="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          @for (f of filters; track f.k) {
            <button class="flex-1 rounded-lg py-1.5 transition" [class]="filter() === f.k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="filter.set(f.k)">{{ f.l }}</button>
          }
        </div>
        <ul class="mt-2 max-h-[65vh] space-y-1 overflow-y-auto">
          @for (v of worklist(); track v.id) {
            <li>
              <button class="w-full rounded-xl px-3 py-2.5 text-left transition" [class]="open()?.id === v.id ? 'bg-brand/10 ring-1 ring-brand/20' : 'hover:bg-slate-50'" (click)="openVisit(v)">
                <span class="flex items-center justify-between gap-2">
                  <b class="truncate text-sm text-slate-800">{{ v.patient_name }}</b>
                  <app-status-pill [status]="v.status" />
                </span>
                <span class="mt-0.5 block truncate font-mono text-[11px] text-slate-400">#{{ v.token }} · {{ codes(v) }}</span>
              </button>
            </li>
          } @empty {
            <li class="px-3 py-8 text-center text-sm text-slate-400">Nothing waiting for results.</li>
          }
        </ul>
      </aside>

      <!-- Entry -->
      @if (open(); as v) {
        <section class="min-w-0 space-y-4">
          <div class="card flex flex-wrap items-center gap-3 p-4">
            <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden" (click)="close()" aria-label="Back"><lucide-icon name="chevron-left" class="size-5" /></button>
            <div class="min-w-0 flex-1">
              <p class="font-mono text-xs font-bold text-brand">#{{ v.token }}</p>
              <h2 class="truncate text-lg font-bold text-slate-800">{{ v.patient_name }}</h2>
              <p class="text-xs text-slate-400">{{ v.age ?? '—' }} yrs · {{ v.gender ?? '—' }} · registered {{ v.created_at | date: 'MMM d, h:mm a' }}</p>
            </div>
            @if (v.report_path) {
              <a class="btn-ghost py-2! text-xs" [href]="lab.reportUrl(v)" target="_blank" rel="noopener"><lucide-icon name="eye" class="size-3.5" /> Report PDF</a>
            }
          </div>

          @if (loading()) {
            <div class="card grid place-items-center py-16"><lucide-icon name="loader-circle" class="size-6 animate-spin text-slate-300" /></div>
          } @else {
            @for (t of tests(); track t.code) {
              @let r = resultOf(t.code);
              <div class="card overflow-hidden">
                <div class="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <b class="text-sm text-slate-800">{{ t.name }}</b>
                  <span class="font-mono text-[11px] text-slate-400">{{ t.code }}{{ t.sample ? ' · ' + t.sample : '' }}</span>
                  <span class="ml-auto flex items-center gap-1.5">
                    @if (r?.source === 'device') { <span class="pill border-sky-100 bg-sky-50 text-sky-600"><lucide-icon name="monitor" class="size-3" /> From analyzer</span> }
                    @switch (r?.status) {
                      @case ('verified') { <span class="pill border-emerald-100 bg-emerald-50 text-emerald-600"><lucide-icon name="badge-check" class="size-3" /> Verified</span> }
                      @case ('entered') { <span class="pill border-amber-100 bg-amber-50 text-amber-600">Entered · to verify</span> }
                      @default { <span class="pill border-slate-200 bg-white text-slate-500">Pending</span> }
                    }
                  </span>
                </div>
                @if (t.params?.length) {
                  <div class="divide-y divide-slate-50 px-4">
                    @for (p of t.params; track p.key) {
                      @if (p.section && p.section !== prevSection(t, $index)) {
                        <p class="pt-3 pb-1 text-[11px] font-bold tracking-wide text-slate-400 uppercase">{{ p.section }}</p>
                      }
                      <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[minmax(0,1fr)_150px_70px_110px_56px]">
                        <span class="min-w-0 text-sm text-slate-700">{{ p.name }} <span class="font-mono text-[10px] text-slate-300">{{ p.key }}</span></span>
                        <span class="row-span-2 sm:row-span-1">
                          @if (p.formula) {
                            <span class="block rounded-xl bg-slate-50 px-3 py-2 text-right font-mono text-sm text-slate-600" title="Calculated: {{ p.formula }}">{{ calc(t, p.key) || '—' }}</span>
                          } @else if (p.type === 'option') {
                            <select class="input py-2!" [ngModel]="typed()[t.code]?.[p.key] ?? ''" (ngModelChange)="type(t.code, p.key, $event)" [disabled]="locked(r)">
                              <option value="">—</option>
                              @for (o of p.options ?? []; track o) { <option [value]="o">{{ o }}</option> }
                            </select>
                          } @else {
                            <input class="input py-2! text-right font-mono" [class.is-invalid]="!!badNum(p, t.code)" [ngModel]="typed()[t.code]?.[p.key] ?? ''" (ngModelChange)="type(t.code, p.key, $event)"
                                   [attr.inputmode]="p.type === 'text' ? null : 'decimal'" [disabled]="locked(r)" [attr.aria-label]="p.name" autocomplete="off" />
                          }
                        </span>
                        <span class="text-xs text-slate-400 sm:text-left">{{ p.unit }}</span>
                        <span class="hidden text-xs text-slate-400 sm:block">{{ range(p) }}</span>
                        <span class="hidden text-right text-xs font-bold sm:block" [class]="flagClass(t, p)">{{ flagText(t, p) }}</span>
                      </div>
                    }
                  </div>
                  <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
                    <input class="input min-w-0 flex-1 py-1.5! text-xs" placeholder="Note on the report (optional)" maxlength="300" [ngModel]="notes()[t.code]" (ngModelChange)="setNote(t.code, $event)" [disabled]="locked(r)" />
                    @if (r?.status === 'verified') {
                      <span class="text-xs text-emerald-600">✓ {{ r!.verified_at | date: 'MMM d, h:mm a' }}</span>
                      @if (results.canVerify() && !v.report_path) {
                        <button class="text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline" (click)="unlock(t.code)">Edit</button>
                      }
                    }
                  </div>
                } @else {
                  <p class="px-4 py-4 text-sm text-slate-500">
                    No values set up for this test — upload its PDF from the dashboard
                    @if (isOwner()) { , or add values in <a routerLink="/lab/tests" class="font-semibold text-brand hover:underline">Tests & prices</a> }.
                  </p>
                }
              </div>
            }

            <div class="card sticky bottom-20 flex flex-wrap items-center gap-3 p-4 md:bottom-4">
              <p class="min-w-0 flex-1 text-xs text-slate-500">
                @if (v.report_path) { Report already created — editing results needs a new report. }
                @else if (!entryTests().length) { None of these tests has values set up. }
                @else { {{ doneCount() }} of {{ entryTests().length }} test(s) complete{{ flagged() ? ' · ' + flagged() + ' value(s) out of range' : '' }}. }
              </p>
              <button class="btn-ghost" (click)="save('entered')" [disabled]="busy() || !entryTests().length || !!v.report_path">
                <lucide-icon name="save" class="size-4" /> Save
              </button>
              @if (results.canVerify()) {
                <button class="btn-primary bg-emerald-600! hover:bg-emerald-700!" (click)="verifyAndReport()" [disabled]="busy() || !entryTests().length || !!v.report_path">
                  <lucide-icon [name]="busy() ? 'loader-circle' : 'badge-check'" class="size-4" [class.animate-spin]="busy()" /> Verify & create report
                </button>
              }
            </div>
          }
        </section>
      } @else {
        <section class="card hidden place-items-center p-16 text-center text-sm text-slate-400 lg:grid">
          <div><lucide-icon name="microscope" class="mx-auto size-8 text-slate-300" /><p class="mt-2">Pick a patient to enter results.</p></div>
        </section>
      }
    </div>
  `,
})
export class LabResults implements OnDestroy {
  /** ?visit=<id> opens that visit */
  readonly visit = input<string>();
  protected readonly lab = inject(LabService);
  protected readonly results = inject(ResultsService);
  private readonly tenant = inject(TenantService);
  private readonly sb = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly router = inject(Router);

  protected readonly filters = [
    { k: 'todo', l: 'To do' },
    { k: 'verify', l: 'To verify' },
    { k: 'all', l: 'All' },
  ] as const;
  protected readonly filter = signal<'todo' | 'verify' | 'all'>('todo');
  protected readonly q = signal('');
  protected readonly open = signal<Visit | null>(null);
  protected readonly rows = signal<TestResult[]>([]);
  protected readonly typed = signal<Typed>({});
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly narrow = signal(typeof window !== 'undefined' && window.innerWidth < 1024);
  /** Visit ids that have results entered but not verified (for the "To verify" filter) */
  private readonly toVerify = signal<Set<string>>(new Set());
  private channel?: RealtimeChannel;

  protected readonly isOwner = inject(AuthService).isOwner;
  protected readonly worklist = computed(() => {
    const q = this.q().trim().toLowerCase();
    const f = this.filter();
    return this.lab
      .visits()
      .filter((v) => (f === 'all' ? true : f === 'verify' ? this.toVerify().has(v.id) : !v.report_path))
      .filter((v) => !q || v.token.toLowerCase().includes(q) || v.patient_name.toLowerCase().includes(q) || (v.mobile ?? '').includes(q))
      .slice(0, 100);
  });
  protected readonly tests = computed(() => {
    const v = this.open();
    return v ? this.results.testsFor(v) : [];
  });
  protected readonly entryTests = computed(() => this.tests().filter((t) => t.params?.length));
  protected readonly doneCount = computed(() => this.entryTests().filter((t) => isComplete(t, buildValues(t, this.typed()[t.code] ?? {}))).length);
  protected readonly flagged = computed(() => {
    const v = this.open();
    let n = 0;
    for (const t of this.entryTests()) for (const val of Object.values(buildValues(t, this.typed()[t.code] ?? {}, v?.gender))) if (val.flag && val.flag !== 'normal') n++;
    return n;
  });

  constructor() {
    effect(() => {
      const id = this.visit();
      if (!id) return;
      const v = this.lab.visits().find((x) => x.id === id);
      if (v && this.open()?.id !== id) this.openVisit(v);
    });
    // Keep the open visit fresh (status / report changes) from the live visits feed
    effect(() => {
      const cur = this.open();
      if (!cur) return;
      const fresh = this.lab.visits().find((x) => x.id === cur.id);
      if (fresh && fresh !== cur) this.open.set(fresh);
    });
    void this.loadPendingVerify();
    this.channel = this.sb.client
      .channel('results-' + crypto.randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_results' }, (p) => {
        const row = (p.new ?? p.old) as TestResult;
        void this.loadPendingVerify();
        // Analyzer results arriving for the open visit
        if (row?.visit_id && row.visit_id === this.open()?.id && (p.new as TestResult)?.source === 'device') void this.reload(false);
      })
      .subscribe();
  }

  ngOnDestroy() {
    if (this.channel) void this.sb.client.removeChannel(this.channel);
  }

  private async loadPendingVerify() {
    const { data } = await this.sb.client.from('test_results').select('visit_id').eq('status', 'entered').limit(500);
    this.toVerify.set(new Set((data ?? []).map((r) => r.visit_id as string)));
  }

  codes(v: Visit) {
    return v.tests.map((t) => t.code).join(', ');
  }

  async openVisit(v: Visit) {
    this.open.set(v);
    this.router.navigate([], { queryParams: { visit: v.id }, replaceUrl: true });
    await this.reload(true);
  }

  close() {
    this.open.set(null);
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  private async reload(spinner: boolean) {
    const v = this.open();
    if (!v) return;
    if (spinner) this.loading.set(true);
    try {
      const rows = await this.results.forVisit(v.id);
      this.rows.set(rows);
      const typed: Typed = {};
      const notes: Record<string, string> = {};
      for (const r of rows) {
        typed[r.test_code] = Object.fromEntries(Object.entries(r.values).map(([k, val]) => [k, val.v]));
        if (r.notes) notes[r.test_code] = r.notes;
      }
      this.typed.set(typed);
      this.notes.set(notes);
    } catch (e) {
      this.toast.fail(e, 'Could not load results.');
    } finally {
      this.loading.set(false);
    }
  }

  resultOf(code: string) {
    return this.rows().find((r) => r.test_code === code);
  }
  locked(r: TestResult | undefined) {
    return r?.status === 'verified' || !!this.open()?.report_path;
  }
  unlock(code: string) {
    this.rows.update((rs) => rs.map((r) => (r.test_code === code ? { ...r, status: 'entered' as const } : r)));
  }
  prevSection(t: TestItem, i: number) {
    return i > 0 ? t.params![i - 1].section : undefined;
  }
  range(p: TestParam) {
    return rangeLabel(p, this.open()?.gender);
  }

  type(code: string, key: string, value: string) {
    this.typed.update((t) => ({ ...t, [code]: { ...(t[code] ?? {}), [key]: value } }));
  }
  setNote(code: string, value: string) {
    this.notes.update((n) => ({ ...n, [code]: value }));
  }
  calc(t: TestItem, key: string) {
    return buildValues(t, this.typed()[t.code] ?? {}, this.open()?.gender)[key]?.v ?? '';
  }
  badNum(p: TestParam, code: string) {
    if (p.type === 'text' || p.type === 'option' || p.formula) return false;
    const v = (this.typed()[code]?.[p.key] ?? '').trim();
    return v !== '' && toNumber(v) === null;
  }
  private flagOf(t: TestItem, p: TestParam) {
    const raw = p.formula ? this.calc(t, p.key) : this.typed()[t.code]?.[p.key] ?? '';
    return flagFor(p, toNumber(raw), this.open()?.gender);
  }
  flagText(t: TestItem, p: TestParam) {
    const f = this.flagOf(t, p);
    return f === 'high' ? 'H ↑' : f === 'low' ? 'L ↓' : f === 'normal' ? '✓' : '';
  }
  flagClass(t: TestItem, p: TestParam) {
    return FLAG_STYLE[this.flagOf(t, p) ?? ''] ?? '';
  }

  private problems(): string | null {
    for (const t of this.entryTests()) for (const p of t.params ?? []) if (this.badNum(p, t.code)) return `${t.code}: “${p.name}” must be a number.`;
    return null;
  }

  async save(status: 'entered' | 'verified'): Promise<boolean> {
    const v = this.open();
    if (!v) return false;
    const bad = this.problems();
    if (bad) {
      this.toast.warn(bad);
      return false;
    }
    this.busy.set(true);
    try {
      let saved = 0;
      for (const t of this.entryTests()) {
        const cur = this.resultOf(t.code);
        if (cur?.status === 'verified' && status === 'entered') continue;
        const values = buildValues(t, this.typed()[t.code] ?? {}, v.gender);
        if (!Object.keys(values).length) continue;
        await this.results.save(v, t.code, values, status, this.notes()[t.code] ?? null);
        saved++;
      }
      await this.reload(false);
      if (status === 'entered') this.toast.success(saved ? `Saved ${saved} test(s).` : 'Nothing new to save.');
      return true;
    } catch (e) {
      this.toast.fail(e, 'Could not save the results.');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async verifyAndReport() {
    const v = this.open();
    if (!v) return;
    const incomplete = this.entryTests().filter((t) => !isComplete(t, buildValues(t, this.typed()[t.code] ?? {})));
    const noParams = this.tests().filter((t) => !t.params?.length);
    const details = [
      ...incomplete.map((t) => `${t.name}: some values are empty`),
      ...noParams.map((t) => `${t.name}: no values set up — shown as "results to follow"`),
      ...(this.flagged() ? [`${this.flagged()} value(s) out of range (marked H / L)`] : []),
    ];
    const ok = await this.dialog.confirm({
      title: 'Verify and create the report?',
      message: `The report PDF is created from these values for ${v.patient_name} and becomes available to the patient.`,
      details: details.length ? details : undefined,
      confirmText: 'Verify & create report',
      tone: 'success',
      icon: 'badge-check',
    });
    if (!ok) return;
    if (!(await this.save('verified'))) return;
    this.busy.set(true);
    try {
      const updated = await this.results.createReport(v, this.rows());
      this.open.set(updated);
      this.toast.success('Report created — share it from the dashboard.');
    } catch (e) {
      this.toast.fail(e, 'Results are verified, but the report could not be created. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
