import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AdminService } from '../../core/admin.service';
import { BillingEvent, billingLabel, Plan, Tenant } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { TeamManager } from '../../shared/team-manager';
import { PayInvoiceModal } from '../../shared/pay-invoice-modal';

/** Lab owner view: plan & trial, invoices, and staff logins. Everything else is set by SpreadApps. */
@Component({
  selector: 'app-lab-account',
  imports: [LucideAngularModule, DatePipe, TeamManager, PayInvoiceModal],
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Lab account</h1>
    <p class="text-sm text-slate-500">Plan, invoices and team for {{ tenant.name() }}.</p>

    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <section class="card p-5 lg:col-span-1">
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand"><lucide-icon name="credit-card" class="size-5" /></span>
          <div>
            <p class="text-xs text-slate-400">Current plan</p>
            <p class="font-bold text-slate-800">{{ plan()?.name || 'Not assigned' }}</p>
          </div>
          <span class="pill ml-auto capitalize" [class]="statusTone()">{{ tenant.tenant()?.status }}</span>
        </div>
        <dl class="mt-5 space-y-2.5 text-sm">
          @if (tenant.trialDaysLeft() !== null) {
            <div class="flex justify-between"><dt class="text-slate-500">Trial ends</dt><dd class="font-semibold text-slate-700">{{ tenant.tenant()?.trial_ends_at | date: 'MMM d, y' }} ({{ tenant.trialDaysLeft() }}d)</dd></div>
          }
          @if (plan(); as p) {
            <div class="flex justify-between"><dt class="text-slate-500">Billing</dt><dd class="font-semibold text-slate-700 capitalize">{{ p.billing_model.replace('_', ' ') }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Price</dt><dd class="font-semibold text-slate-700">{{ priceLabel() }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Report quota</dt><dd class="font-semibold text-slate-700">{{ p.report_quota ?? 'Unlimited' }}</dd></div>
          }
          @if (row()?.subscription_ends_at) {
            <div class="flex justify-between"><dt class="text-slate-500">Renews</dt><dd class="font-semibold text-slate-700">{{ row()!.subscription_ends_at | date: 'MMM d, y' }}</dd></div>
          }
        </dl>
        <a [href]="'mailto:' + brand.supportEmail + '?subject=Plan%20change%20-%20' + tenant.slug()" class="btn-ghost mt-5 w-full">
          <lucide-icon name="mail" class="size-4" /> Talk to {{ brand.name }}
        </a>
      </section>

      <section class="card p-5 lg:col-span-2">
        <div class="flex items-center justify-between gap-3">
          <h2 class="section-title">Invoices</h2>
          @if (dueTotal()) {
            <span class="pill border-amber-200 bg-amber-50 text-amber-700">₹{{ dueTotal().toLocaleString('en-IN') }} due</span>
          }
        </div>
        @if (tenant.tenant()?.block_reason === 'payment_overdue') {
          <div class="mt-3 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-700">
            <lucide-icon name="lock" class="mt-0.5 size-4 shrink-0" />
            <span><b class="block">New patients and uploads are paused</b>An invoice is past its due date. Pay it below — work resumes as soon as {{ brand.name }} confirms the payment.</span>
          </div>
        }
        @if (bills().length) {
          <ul class="mt-3 divide-y divide-slate-100">
            @for (b of bills(); track b.id) {
              <li class="flex items-center gap-3 py-3 text-sm">
                <lucide-icon name="receipt" class="size-4 text-slate-400" />
                <span class="min-w-0 flex-1 text-slate-600">
                  <b class="block text-slate-700">{{ label(b.kind) }}</b>
                  <span class="block truncate text-xs text-slate-400">{{ b.period }}{{ b.note ? ' · ' + b.note : '' }}{{ b.status === 'due' && b.due_date ? ' · due ' + (b.due_date | date: 'MMM d, y') : '' }}{{ b.status === 'verifying' ? ' · ref ' + b.payment_ref : '' }}</span>
                  @if (b.status === 'due' && overdue(b)) {
                    <span class="block text-xs font-semibold text-rose-600">Overdue</span>
                  } @else if (b.status === 'due' && b.reject_reason) {
                    <span class="block truncate text-xs text-rose-600">Payment not confirmed — {{ b.reject_reason }}</span>
                  }
                </span>
                <span class="font-semibold text-slate-700">₹{{ b.amount.toLocaleString('en-IN') }}</span>
                @switch (b.status) {
                  @case ('due') {
                    <button class="btn-primary px-3! py-1.5! text-xs" [class.bg-rose-600!]="overdue(b)" (click)="paying.set(b)">
                      <lucide-icon name="qr-code" class="size-3.5" /> {{ b.reject_reason ? 'Pay again' : 'Pay now' }}
                    </button>
                  }
                  @case ('verifying') {
                    <span class="pill border-sky-100 bg-sky-50 text-sky-600" [title]="'Ref ' + (b.payment_ref ?? '')">Verifying</span>
                  }
                  @default {
                    <span class="pill capitalize" [class]="b.status === 'paid' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-500'">{{ b.status }}</span>
                  }
                }
              </li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-sm text-slate-400">No invoices yet.</p>
        }
      </section>

      @if (paying(); as pb) {
        <app-pay-invoice-modal [bill]="pb" (closed)="paying.set(null)" (paid)="afterPay()" />
      }

      <div class="lg:col-span-3">
        <app-team-manager scope="lab" [tenantId]="tenant.tenant()!.id" heading="Your team — admins & staff"
                          [signInHint]="host + '/login'" />
      </div>
    </div>
  `,
})
export class LabAccount implements OnInit {
  protected readonly tenant = inject(TenantService);
  private readonly admin = inject(AdminService);
  private readonly sb = inject(SupabaseService);
  protected readonly brand = environment.brand;

  protected readonly row = signal<Tenant | null>(null);
  protected readonly plan = signal<Plan | null>(null);
  protected readonly bills = signal<BillingEvent[]>([]);
  protected readonly host = location.host;

  protected readonly statusTone = computed(() => {
    const s = this.tenant.tenant()?.status;
    return s === 'active' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : s === 'trial' ? 'border-amber-100 bg-amber-50 text-amber-600' : 'border-rose-100 bg-rose-50 text-rose-600';
  });
  protected readonly label = billingLabel;
  protected readonly paying = signal<BillingEvent | null>(null);
  overdue(b: BillingEvent) {
    return !!b.due_date && b.due_date < new Date().toISOString().slice(0, 10);
  }
  async afterPay() {
    this.paying.set(null);
    this.bills.set(await this.admin.billing(this.tenant.tenant()!.id));
  }
  protected readonly dueTotal = computed(() => this.bills().filter((b) => b.status === 'due').reduce((s, b) => s + Number(b.amount), 0));
  protected readonly priceLabel = computed(() => {
    const p = this.plan();
    if (!p) return '';
    const base = this.row()?.custom_price ?? p.price;
    switch (p.billing_model) {
      case 'monthly': return `₹${base}/month`;
      case 'yearly': return `₹${base}/year`;
      case 'per_report': return `₹${p.per_report_fee}/report`;
      case 'hybrid': return `₹${base}/month + ₹${p.per_report_fee}/report`;
      case 'revenue_share': return `${p.revenue_share_pct}% of billing`;
      default: return 'Free';
    }
  });

  async ngOnInit() {
    const id = this.tenant.tenant()!.id;
    const { data: t } = await this.sb.client.from('tenants').select('*').eq('id', id).maybeSingle();
    this.row.set(t as Tenant);
    if (t?.plan_id) {
      const { data: p } = await this.sb.client.from('plans').select('*').eq('id', t.plan_id).maybeSingle();
      this.plan.set(p as Plan);
    }
    this.bills.set(await this.admin.billing(id));
  }
}
