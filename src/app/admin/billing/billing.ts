import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService } from '../../core/admin.service';
import { BillingEvent } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { KpiCard } from '../../shared/kpi-card';

@Component({
  selector: 'app-admin-billing',
  imports: [RouterLink, LucideAngularModule, DatePipe, DecimalPipe, KpiCard],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Billing</h1>
        <p class="text-sm text-slate-500">Ledger across all labs. Generate the month's invoices from each lab's plan.</p>
      </div>
      <button class="btn-primary" (click)="generate()" [disabled]="busy()">
        <lucide-icon [name]="busy() ? 'loader-circle' : 'receipt'" class="size-4" [class.animate-spin]="busy()" /> Generate {{ period }} invoices
      </button>
    </div>

    <section class="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <app-kpi-card label="MRR (active plans)" [value]="'₹' + (admin.totals().mrr | number)" icon="trending-up" tone="bg-emerald-50 text-emerald-600" />
      <app-kpi-card label="Collected (all time)" [value]="'₹' + (sum().paid | number)" icon="wallet" tone="bg-sky-50 text-sky-600" />
      <app-kpi-card label="Outstanding" [value]="'₹' + (sum().due | number)" icon="hourglass" tone="bg-amber-50 text-amber-600" />
      <app-kpi-card label="This month billed" [value]="'₹' + (sum().month | number)" icon="receipt" />
    </section>

    <div class="card mt-5 overflow-x-auto">
      <table class="w-full min-w-[640px] text-sm">
        <thead class="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
          <tr><th class="px-5 py-3">Lab</th><th class="px-3 py-3">Kind</th><th class="px-3 py-3">Period</th><th class="px-3 py-3 text-right">Amount</th><th class="px-3 py-3">Status</th><th class="px-5 py-3">Created</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (b of events(); track b.id) {
            <tr class="hover:bg-slate-50/60">
              <td class="px-5 py-3"><a [routerLink]="['/admin/labs', b.tenant_id]" class="font-semibold text-slate-700 hover:text-brand">{{ labName(b.tenant_id) }}</a></td>
              <td class="px-3 py-3 capitalize text-slate-600">{{ b.kind.replace('_', ' ') }}</td>
              <td class="px-3 py-3 text-slate-500">{{ b.period }}</td>
              <td class="px-3 py-3 text-right font-semibold text-slate-700">₹{{ b.amount | number }}</td>
              <td class="px-3 py-3">
                @if (b.status === 'due') {
                  <button class="pill border-amber-100 bg-amber-50 text-amber-600 hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-600" (click)="mark(b, 'paid')">Due · mark paid</button>
                } @else {
                  <span class="pill capitalize" [class]="b.status === 'paid' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-500'">{{ b.status }}</span>
                }
              </td>
              <td class="px-5 py-3 text-xs text-slate-400">{{ b.created_at | date: 'MMM d, y' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="px-5 py-12 text-center text-slate-400">No billing entries yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminBilling implements OnInit {
  protected readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  protected readonly events = signal<BillingEvent[]>([]);
  protected readonly busy = signal(false);
  protected readonly period = new Date().toISOString().slice(0, 7);

  protected readonly sum = computed(() => {
    const e = this.events();
    return {
      paid: e.filter((x) => x.status === 'paid').reduce((s, x) => s + Number(x.amount), 0),
      due: e.filter((x) => x.status === 'due').reduce((s, x) => s + Number(x.amount), 0),
      month: e.filter((x) => x.period === this.period).reduce((s, x) => s + Number(x.amount), 0),
    };
  });

  async ngOnInit() {
    await this.admin.ensureLoaded();
    this.events.set(await this.admin.billing());
  }

  labName(id: string) {
    return this.admin.tenants().find((t) => t.id === id)?.name ?? '—';
  }

  async mark(b: BillingEvent, status: BillingEvent['status']) {
    await this.admin.setBillingStatus(b.id, status);
    this.events.set(await this.admin.billing());
  }

  /** One "due" entry per active lab for this month, skipping labs already billed for the period. */
  async generate() {
    this.busy.set(true);
    try {
      const billed = new Set(this.events().filter((e) => e.period === this.period && e.kind !== 'adjustment').map((e) => e.tenant_id));
      const targets = this.admin.rows().filter((r) => r.effectiveStatus === 'active' && r.mrr > 0 && !billed.has(r.id));
      for (const r of targets) {
        const usage = r.plan?.billing_model === 'per_report';
        await this.admin.addBilling({
          tenant_id: r.id,
          kind: usage ? 'per_report' : 'subscription',
          amount: r.mrr,
          period: this.period,
          status: 'due',
          note: `${r.plan?.name}${usage ? ` · ${r.stats?.reports_month ?? 0} reports` : ''}`,
        });
      }
      this.events.set(await this.admin.billing());
      await this.admin.loadAll();
      this.toast.success(targets.length ? `${targets.length} invoice(s) created for ${this.period}` : 'Nothing new to bill this month');
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
