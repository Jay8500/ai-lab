import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { KpiCard } from '../../shared/kpi-card';
import { LabStatusPill } from '../lab-status-pill';

@Component({
  selector: 'app-admin-overview',
  imports: [RouterLink, LucideAngularModule, KpiCard, DecimalPipe, DatePipe, LabStatusPill],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">Spread Apps AI-Lab</p>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[28px]">Welcome back, {{ name() }}!</h1>
      </div>
      <a routerLink="/admin/labs" [queryParams]="{ new: 1 }" class="btn-primary"><lucide-icon name="plus" class="size-4" /> New lab</a>
    </div>

    <section class="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <app-kpi-card label="Labs" [value]="t().labs" icon="building-2" [hint]="t().active + ' active · ' + t().trial + ' on trial'" />
      <app-kpi-card label="Monthly recurring" [value]="'₹' + (t().mrr | number)" icon="trending-up" tone="bg-emerald-50 text-emerald-600" hint="From active plans" />
      <app-kpi-card label="Collected" [value]="'₹' + (t().collected | number)" icon="wallet" tone="bg-sky-50 text-sky-600" [hint]="'₹' + (t().due | number) + ' due'" />
      <app-kpi-card label="Reports this month" [value]="t().reportsMonth" icon="file-check" tone="bg-violet-50 text-violet-600" [hint]="t().tickets + ' open tickets'" />
    </section>

    <section class="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div class="card p-5">
        <div class="flex items-center justify-between">
          <h2 class="section-title">Revenue by lab</h2>
          <span class="text-xs text-slate-400">Monthly value · usage this month</span>
        </div>
        <div class="mt-5 space-y-4">
          @for (r of byRevenue(); track r.id) {
            <a [routerLink]="['/admin/labs', r.slug]" class="group block">
              <div class="flex items-center justify-between text-sm">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="size-2.5 shrink-0 rounded-full" [style.background]="r.brand_color"></span>
                  <span class="truncate font-semibold text-slate-700 group-hover:text-brand">{{ r.name }}</span>
                  <app-lab-status-pill [status]="r.effectiveStatus" />
                </span>
                <span class="font-bold text-slate-800">₹{{ r.mrr | number }}</span>
              </div>
              <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full transition-all duration-700" [style.width.%]="(r.mrr / maxMrr()) * 100" [style.background]="r.brand_color"></div>
              </div>
              <p class="mt-1 text-[11px] text-slate-400">{{ r.plan?.name || 'No plan' }} · {{ r.stats?.visits_month ?? 0 }} visits · {{ r.stats?.reports_month ?? 0 }} reports</p>
            </a>
          } @empty {
            <p class="py-6 text-center text-sm text-slate-400">No labs yet.</p>
          }
        </div>
      </div>

      <div class="space-y-4">
        <div class="card p-5">
          <h2 class="section-title">Trials ending soon</h2>
          <ul class="mt-3 divide-y divide-slate-100">
            @for (r of trials(); track r.id) {
              <li class="flex items-center gap-3 py-2.5">
                <span class="grid size-9 place-items-center rounded-xl text-xs font-bold text-white" [style.background]="r.brand_color">{{ r.name[0] }}</span>
                <div class="min-w-0 flex-1">
                  <a [routerLink]="['/admin/labs', r.slug]" class="block truncate text-sm font-semibold text-slate-700 hover:text-brand">{{ r.name }}</a>
                  <p class="text-xs text-slate-400">Ends {{ r.trialEndsAt | date: 'MMM d' }}</p>
                </div>
                <span class="pill" [class]="(r.daysLeft ?? 0) <= 3 ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-amber-100 bg-amber-50 text-amber-600'">
                  {{ (r.daysLeft ?? 0) <= 0 ? 'Expired' : r.daysLeft + 'd left' }}
                </span>
              </li>
            } @empty {
              <li class="py-4 text-sm text-slate-400">No labs on trial.</li>
            }
          </ul>
        </div>
        <div class="card p-5">
          <h2 class="section-title">Today</h2>
          <div class="mt-3 grid grid-cols-2 gap-3 text-center">
            <div class="rounded-xl bg-slate-50 p-3"><p class="text-2xl font-bold text-slate-800">{{ today().visits }}</p><p class="text-xs text-slate-500">Patients registered</p></div>
            <div class="rounded-xl bg-slate-50 p-3"><p class="text-2xl font-bold text-slate-800">{{ today().labsBusy }}</p><p class="text-xs text-slate-500">Labs active today</p></div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class AdminOverview {
  protected readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  protected readonly t = this.admin.totals;
  protected readonly name = computed(() => this.auth.displayName().split(' ')[0]);
  protected readonly byRevenue = computed(() => [...this.admin.rows()].sort((a, b) => b.mrr - a.mrr).slice(0, 8));
  protected readonly maxMrr = computed(() => Math.max(1, ...this.byRevenue().map((r) => r.mrr)));
  protected readonly trials = computed(() =>
    this.admin.rows().filter((r) => r.status === 'trial').sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 6),
  );
  protected readonly today = computed(() => {
    const rows = this.admin.rows();
    return {
      visits: rows.reduce((s, r) => s + Number(r.stats?.visits_today ?? 0), 0),
      labsBusy: rows.filter((r) => Number(r.stats?.visits_today ?? 0) > 0).length,
    };
  });
}
