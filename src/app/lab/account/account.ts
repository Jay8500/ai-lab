import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AdminService } from '../../core/admin.service';
import { BillingEvent, Plan, Tenant } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { TeamManager } from '../../shared/team-manager';

/** Lab owner view: plan & trial, invoices, and staff logins. Everything else is set by SpreadApps. */
@Component({
  selector: 'app-lab-account',
  imports: [LucideAngularModule, DatePipe, TeamManager],
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
        <h2 class="section-title">Invoices</h2>
        @if (bills().length) {
          <ul class="mt-3 divide-y divide-slate-100">
            @for (b of bills(); track b.id) {
              <li class="flex items-center gap-3 py-3 text-sm">
                <lucide-icon name="receipt" class="size-4 text-slate-400" />
                <span class="flex-1 text-slate-600"><b class="capitalize text-slate-700">{{ b.kind.replace('_', ' ') }}</b> {{ b.period ? '· ' + b.period : '' }} {{ b.note ? '· ' + b.note : '' }}</span>
                <span class="font-semibold text-slate-700">₹{{ b.amount }}</span>
                <span class="pill capitalize" [class]="b.status === 'paid' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-amber-100 bg-amber-50 text-amber-600'">{{ b.status }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="mt-3 text-sm text-slate-400">No invoices yet.</p>
        }
      </section>

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
