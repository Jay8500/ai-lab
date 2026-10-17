import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { LabService } from '../../core/lab.service';
import { VisitStatus } from '../../core/models';
import { KpiCard } from '../../shared/kpi-card';
import { PatientCard } from '../../shared/patient-card';

type Filter = 'active' | 'processing' | 'ready' | 'delivered' | 'all';

const FILTERS: { key: Filter; label: string; match: (s: VisitStatus) => boolean }[] = [
  { key: 'active', label: 'Active', match: (s) => s !== 'delivered' },
  { key: 'processing', label: 'Processing', match: (s) => ['collected', 'in_lab', 'verified'].includes(s) },
  { key: 'ready', label: 'Ready', match: (s) => s === 'ready' },
  { key: 'delivered', label: 'Delivered', match: (s) => s === 'delivered' },
  { key: 'all', label: 'All (7 days)', match: () => true },
];

@Component({
  selector: 'app-lab-dashboard',
  imports: [FormsModule, LucideAngularModule, KpiCard, PatientCard],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">{{ greeting() }}</p>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[28px]">Welcome back, {{ firstName() }}!</h1>
      </div>
    </div>

    <section class="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <app-kpi-card label="Today's Tokens" [value]="lab.kpis().tokens" icon="ticket" hint="Registered since midnight" />
      <app-kpi-card label="Reports Processing" [value]="lab.kpis().processing" icon="flask-conical" tone="bg-amber-50 text-amber-600"
                    [hint]="lab.kpis().ready + ' ready to send'" />
      <app-kpi-card label="Delivered Today" [value]="lab.kpis().delivered" icon="send" tone="bg-emerald-50 text-emerald-600" hint="Shared with patients" />
      <app-kpi-card label="Today's Billing" [value]="'₹' + lab.kpis().revenue.toLocaleString('en-IN')" icon="indian-rupee"
                    tone="bg-sky-50 text-sky-600" hint="Sum of tests booked" />
    </section>

    <section class="mt-5 grid gap-4 lg:grid-cols-[1fr_300px]">
      <!-- Active patients -->
      <div class="min-w-0">
        <div class="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div class="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1">
            @for (f of filters; track f.key) {
              <button class="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition"
                      [class]="filter() === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                      (click)="filter.set(f.key)">
                {{ f.label }} <span class="ml-1 text-slate-400">{{ counts()[f.key] }}</span>
              </button>
            }
          </div>
          <div class="relative sm:ml-auto sm:w-64">
            <lucide-icon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input class="input !py-2 !pl-9" placeholder="Search name, token, mobile" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </div>
        </div>

        @if (lab.loading() && !lab.visits().length) {
          <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            @for (i of [1, 2, 3]; track i) {
              <div class="card h-64 animate-pulse p-4"><div class="h-3 w-20 rounded bg-slate-100"></div><div class="mt-3 h-5 w-32 rounded bg-slate-100"></div></div>
            }
          </div>
        } @else if (visible().length) {
          <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            @for (v of visible(); track v.id) {
              <app-patient-card [visit]="v" />
            }
          </div>
        } @else {
          <div class="card mt-4 flex flex-col items-center px-6 py-14 text-center">
            <span class="grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><lucide-icon name="user-plus" class="size-7" /></span>
            <h3 class="mt-4 font-bold text-slate-800">{{ q() ? 'No matches' : 'No patients here yet' }}</h3>
            <p class="mt-1 max-w-xs text-sm text-slate-500">{{ q() ? 'Try a different name, token or mobile number.' : 'Register the first patient of the day to generate a token.' }}</p>
            @if (!q()) {
              <button class="btn-primary mt-5" (click)="lab.addOpen.set(true)"><lucide-icon name="plus" class="size-4" /> Add new patient</button>
            }
          </div>
        }
      </div>

      <!-- Week at a glance -->
      <aside class="space-y-4">
        <div class="card p-5">
          <div class="flex items-center justify-between">
            <h2 class="section-title">This week</h2>
            <span class="text-xs text-slate-400">{{ weekTotal() }} patients</span>
          </div>
          <div class="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-brand"></span>Registered</span>
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-emerald-400"></span>Reports</span>
          </div>
          <div class="mt-4 flex h-36 items-end justify-between gap-2">
            @for (d of week(); track d.label) {
              <div class="flex flex-1 flex-col items-center gap-1.5">
                <div class="flex h-28 w-full items-end justify-center gap-0.5">
                  <div class="w-1/2 max-w-3 rounded-t-md bg-brand transition-all duration-700" [style.height.%]="(d.total / weekMax()) * 100" [title]="d.total + ' registered'"></div>
                  <div class="w-1/2 max-w-3 rounded-t-md bg-emerald-400 transition-all duration-700" [style.height.%]="(d.reports / weekMax()) * 100" [title]="d.reports + ' reports'"></div>
                </div>
                <span class="text-[10px] font-semibold" [class]="d.today ? 'text-brand' : 'text-slate-400'">{{ d.label }}</span>
              </div>
            }
          </div>
        </div>

        <div class="card p-5">
          <h2 class="section-title">Workflow</h2>
          <ol class="mt-3 space-y-3 text-sm">
            @for (s of workflow; track s.t; let i = $index) {
              <li class="flex gap-3">
                <span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">{{ i + 1 }}</span>
                <span class="text-slate-600"><b class="text-slate-800">{{ s.t }}</b> — {{ s.d }}</span>
              </li>
            }
          </ol>
        </div>
      </aside>
    </section>
  `,
})
export class LabDashboard {
  protected readonly lab = inject(LabService);
  private readonly auth = inject(AuthService);

  protected readonly filters = FILTERS;
  protected readonly filter = signal<Filter>('active');
  protected readonly q = signal('');
  protected readonly workflow = [
    { t: 'Register', d: 'add patient & tests, hand over the token' },
    { t: 'Process', d: 'move the sample to testing and verify' },
    { t: 'Upload', d: 'drop the signed PDF on the card' },
    { t: 'Notify', d: 'send the link on WhatsApp in one tap' },
  ];

  protected readonly firstName = computed(() => this.auth.displayName().split(' ')[0] || 'there');
  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  });

  protected readonly counts = computed(() => {
    const all = this.lab.visits();
    return Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((v) => f.match(v.status)).length])) as Record<Filter, number>;
  });

  protected readonly visible = computed(() => {
    const f = FILTERS.find((x) => x.key === this.filter())!;
    const q = this.q().trim().toLowerCase();
    return this.lab
      .visits()
      .filter((v) => f.match(v.status))
      .filter((v) => !q || v.patient_name.toLowerCase().includes(q) || v.token.toLowerCase().includes(q) || (v.mobile ?? '').includes(q));
  });

  protected readonly week = computed(() => {
    const days: { label: string; total: number; reports: number; today: boolean }[] = [];
    const visits = this.lab.visits();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      days.push({
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2),
        total: visits.filter((v) => new Date(v.created_at).toDateString() === key).length,
        reports: visits.filter((v) => v.report_uploaded_at && new Date(v.report_uploaded_at).toDateString() === key).length,
        today: i === 0,
      });
    }
    return days;
  });
  protected readonly weekMax = computed(() => Math.max(4, ...this.week().map((d) => Math.max(d.total, d.reports))));
  protected readonly weekTotal = computed(() => this.week().reduce((s, d) => s + d.total, 0));
}
