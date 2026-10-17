import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { BillingEvent, Plan, Profile, Tenant } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

/** Lab owner view: plan & trial, invoices, and staff logins. Everything else is set by SpreadApps. */
@Component({
  selector: 'app-lab-account',
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Lab account</h1>
    <p class="text-sm text-slate-500">Plan, billing and team for {{ tenant.name() }}.</p>

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
        <div class="flex items-center justify-between">
          <h2 class="section-title">Team</h2>
          <span class="text-xs text-slate-400">{{ users().length }} login(s)</span>
        </div>
        <ul class="mt-3 divide-y divide-slate-100">
          @for (u of users(); track u.id) {
            <li class="flex items-center gap-3 py-3">
              <span class="grid size-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{{ (u.full_name || u.email)[0].toUpperCase() }}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-700">{{ u.full_name || u.email }}</p>
                <p class="truncate text-xs text-slate-400">{{ u.email }}</p>
              </div>
              <span class="pill border-slate-200 bg-slate-50 text-slate-500">{{ u.role === 'lab_owner' ? 'Owner' : 'Staff' }}</span>
              @if (canManage() && u.role === 'lab_staff') {
                <button class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="removeUser(u)" title="Remove"><lucide-icon name="trash-2" class="size-4" /></button>
              }
            </li>
          }
        </ul>
        @if (canManage()) {
          <form class="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]" (ngSubmit)="addUser()">
            <input class="input" name="n" [(ngModel)]="nu.full_name" placeholder="Name" />
            <input class="input" name="e" type="email" [(ngModel)]="nu.email" placeholder="Email" required />
            <input class="input" name="p" [(ngModel)]="nu.password" placeholder="Temp password (8+)" required minlength="8" />
            <button class="btn-primary" type="submit" [disabled]="busy()"><lucide-icon name="user-plus" class="size-4" /> Add staff</button>
          </form>
        }
      </section>

      <section class="card p-5 lg:col-span-3">
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
    </div>
  `,
})
export class LabAccount implements OnInit {
  protected readonly tenant = inject(TenantService);
  private readonly auth = inject(AuthService);
  private readonly admin = inject(AdminService);
  private readonly sb = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  protected readonly brand = environment.brand;

  protected readonly row = signal<Tenant | null>(null);
  protected readonly plan = signal<Plan | null>(null);
  protected readonly users = signal<Profile[]>([]);
  protected readonly bills = signal<BillingEvent[]>([]);
  protected readonly busy = signal(false);
  protected nu = { full_name: '', email: '', password: '' };

  protected readonly canManage = computed(() => this.auth.isOwner());
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
    if (this.canManage()) {
      this.users.set(await this.admin.users(id).catch(() => []));
      this.bills.set(await this.admin.billing(id));
    }
  }

  async addUser() {
    this.busy.set(true);
    try {
      const id = this.tenant.tenant()!.id;
      await this.admin.createUser(id, { ...this.nu, role: 'lab_staff' });
      this.users.set(await this.admin.users(id));
      this.nu = { full_name: '', email: '', password: '' };
      this.toast.success('Staff login created');
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async removeUser(u: Profile) {
    if (!confirm(`Remove ${u.email}?`)) return;
    try {
      await this.admin.removeUser(this.tenant.tenant()!.id, u.id);
      this.users.update((l) => l.filter((x) => x.id !== u.id));
    } catch (e) {
      this.toast.error((e as Error).message);
    }
  }
}
