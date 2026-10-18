import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService } from '../../core/admin.service';
import { BillingEvent, billingLabel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { PaymentReviewService } from '../../core/payment-review.service';
import { KpiCard } from '../../shared/kpi-card';

@Component({
  selector: 'app-admin-billing',
  imports: [RouterLink, LucideAngularModule, DatePipe, DecimalPipe, KpiCard],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Billing</h1>
        <p class="text-sm text-slate-500">Ledger across all labs. Add database, maintenance or other charges from each lab’s Plan & billing tab.</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" class="size-4 accent-[var(--brand)]" [checked]="notify()" (change)="notify.set(!notify())" /> Notify labs
        </label>
        <button class="btn-primary" (click)="generate()" [disabled]="busy()">
          <lucide-icon [name]="busy() ? 'loader-circle' : 'receipt'" class="size-4" [class.animate-spin]="busy()" /> Generate {{ period }} invoices
        </button>
      </div>
    </div>

    <section class="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <app-kpi-card label="MRR (active plans)" [value]="'₹' + (admin.totals().mrr | number)" icon="trending-up" tone="bg-emerald-50 text-emerald-600" />
      <app-kpi-card label="Collected (all time)" [value]="'₹' + (sum().paid | number)" icon="wallet" tone="bg-sky-50 text-sky-600" />
      <app-kpi-card label="Outstanding" [value]="'₹' + (sum().due | number)" icon="hourglass" tone="bg-amber-50 text-amber-600" />
      <app-kpi-card label="This month billed" [value]="'₹' + (sum().month | number)" icon="receipt" />
    </section>

    @if (toVerify().length) {
      <section class="card mt-5 border-sky-100 p-5">
        <h2 class="section-title flex items-center gap-2"><lucide-icon name="badge-check" class="size-4 text-sky-600" /> Payments to confirm ({{ toVerify().length }})</h2>
        <p class="text-xs text-slate-400">Labs say they’ve paid. Check your bank / UPI app for the reference, then confirm.</p>
        <ul class="mt-3 divide-y divide-slate-100">
          @for (b of toVerify(); track b.id) {
            <li class="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span class="min-w-0 flex-1">
                <b class="block text-slate-700">{{ labName(b.tenant_id) }} · ₹{{ b.amount | number }}</b>
                <span class="block text-xs text-slate-500">{{ label(b.kind) }}{{ b.period ? ' · ' + b.period : '' }} · <span class="uppercase">{{ b.paid_via }}</span> · ref <b class="font-mono">{{ b.payment_ref }}</b>{{ b.payment_submitted_at ? ' · ' + (b.payment_submitted_at | date: 'MMM d, h:mm a') : '' }}</span>
                @if (b.payment_note) { <span class="block truncate text-xs text-slate-400">“{{ b.payment_note }}”</span> }
              </span>
              <button class="btn-ghost px-3! py-1.5! text-xs" (click)="reject(b)">Not received</button>
              <button class="btn-primary bg-emerald-600! px-3! py-1.5! text-xs hover:bg-emerald-700!" (click)="verify(b)"><lucide-icon name="badge-check" class="size-3.5" /> Confirm</button>
            </li>
          }
        </ul>
      </section>
    }

    <div class="card mt-5 overflow-x-auto">
      <table class="w-full min-w-[640px] text-sm">
        <thead class="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
          <tr><th class="px-5 py-3">Lab</th><th class="px-3 py-3">Charge</th><th class="px-3 py-3">Period</th><th class="px-3 py-3 text-right">Amount</th><th class="px-3 py-3">Status</th><th class="px-5 py-3">Created</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (b of events(); track b.id) {
            <tr class="hover:bg-slate-50/60">
              <td class="px-5 py-3"><a [routerLink]="['/admin/labs', labSlug(b.tenant_id)]" class="font-semibold text-slate-700 hover:text-brand">{{ labName(b.tenant_id) }}</a></td>
              <td class="px-3 py-3 text-slate-600">{{ label(b.kind) }}@if (b.note) {<span class="block truncate text-xs text-slate-400">{{ b.note }}</span>}</td>
              <td class="px-3 py-3 text-slate-500">{{ b.period }}@if (b.due_date) {<span class="block text-xs" [class]="b.status === 'due' && overdue(b) ? 'font-semibold text-rose-600' : 'text-slate-400'">due {{ b.due_date | date: 'MMM d' }}</span>}</td>
              <td class="px-3 py-3 text-right font-semibold text-slate-700">₹{{ b.amount | number }}</td>
              <td class="px-3 py-3">
                @if (b.status === 'due') {
                  <span class="flex items-center gap-1">
                    <button class="pill border-amber-100 bg-amber-50 text-amber-600 hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-600" (click)="mark(b, 'paid')">Due · mark paid</button>
                    <button class="rounded-lg p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600" (click)="remind(b)" title="Send payment reminder"><lucide-icon name="bell" class="size-4" /></button>
                  </span>
                } @else if (b.status === 'verifying') {
                  <button class="pill border-sky-100 bg-sky-50 text-sky-600 hover:bg-emerald-50 hover:text-emerald-600" (click)="verify(b)" [title]="'Ref ' + b.payment_ref">Verifying · confirm</button>
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
  private readonly review = inject(PaymentReviewService);
  protected readonly toVerify = computed(() => this.events().filter((b) => b.status === 'verifying'));

  async verify(b: BillingEvent) {
    if (await this.review.verify(b, this.labName(b.tenant_id))) this.events.set(await this.admin.billing());
  }

  async reject(b: BillingEvent) {
    if (await this.review.reject(b, this.labName(b.tenant_id))) this.events.set(await this.admin.billing());
  }
  protected readonly period = new Date().toISOString().slice(0, 7);

  protected readonly sum = computed(() => {
    const e = this.events();
    return {
      paid: e.filter((x) => x.status === 'paid').reduce((s, x) => s + Number(x.amount), 0),
      due: e.filter((x) => x.status === 'due' || x.status === 'verifying').reduce((s, x) => s + Number(x.amount), 0),
      month: e.filter((x) => x.period === this.period).reduce((s, x) => s + Number(x.amount), 0),
    };
  });

  async ngOnInit() {
    await this.admin.ensureLoaded();
    this.events.set(await this.admin.billing());
  }

  labSlug(id: string) {
    return this.admin.tenants().find((t) => t.id === id)?.slug ?? id;
  }

  labName(id: string) {
    return this.admin.tenants().find((t) => t.id === id)?.name ?? '—';
  }

  async mark(b: BillingEvent, status: BillingEvent['status']) {
    await this.admin.setBillingStatus(b.id, status);
    this.events.set(await this.admin.billing());
  }

  /** One "due" entry per active lab for this month, skipping labs already billed for the period. */
  protected readonly notify = signal(true);
  protected readonly label = billingLabel;

  overdue(b: BillingEvent) {
    return !!b.due_date && b.due_date < new Date().toISOString().slice(0, 10);
  }

  async remind(b: BillingEvent) {
    try {
      await this.admin.notifyBilling(b, 'reminder');
      this.toast.success(`Reminder sent to ${this.labName(b.tenant_id)}.`);
      this.events.set(await this.admin.billing());
    } catch (e) {
      this.toast.fail(e, 'Could not send the reminder.');
    }
  }

  async generate() {
    this.busy.set(true);
    try {
      const billed = new Set(this.events().filter((e) => e.period === this.period && e.kind !== 'adjustment').map((e) => e.tenant_id));
      let failedNotices = 0;
      const targets = this.admin.rows().filter((r) => r.effectiveStatus === 'active' && r.mrr > 0 && !billed.has(r.id));
      for (const r of targets) {
        const usage = r.plan?.billing_model === 'per_report';
        const b = await this.admin.addBilling({
          tenant_id: r.id,
          kind: usage ? 'per_report' : 'subscription',
          amount: r.mrr,
          period: this.period,
          status: 'due',
          due_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
          note: `${r.plan?.name}${usage ? ` · ${r.stats?.reports_month ?? 0} reports` : ''}`,
        });
        if (this.notify()) await this.admin.notifyBilling(b, 'new').catch(() => (failedNotices += 1));
      }
      this.events.set(await this.admin.billing());
      await this.admin.loadAll();
      this.toast.success(targets.length ? `${targets.length} invoice(s) created for ${this.period}${this.notify() ? ' and labs notified' : ''}.` : 'Nothing new to bill this month');
      if (failedNotices) this.toast.warn(`${failedNotices} notice(s) could not be sent — use the bell to remind.`);
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.busy.set(false);
    }
  }
}
