import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService } from '../../core/admin.service';
import { BillingModel, Plan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

const MODELS: { v: BillingModel; l: string; hint: string }[] = [
  { v: 'free', l: 'Free / trial', hint: 'No charge' },
  { v: 'monthly', l: 'Monthly', hint: 'Fixed fee every month' },
  { v: 'yearly', l: 'Yearly', hint: 'Fixed fee every year' },
  { v: 'per_report', l: 'Pay per report', hint: 'Fee × reports delivered' },
  { v: 'hybrid', l: 'Hybrid', hint: 'Monthly fee + per-report fee' },
  { v: 'revenue_share', l: 'Revenue share', hint: '% of lab billing' },
];

const FEATURES = [
  { key: 'ai_explain', label: 'AI report explainer' },
  { key: 'whatsapp', label: 'WhatsApp API delivery' },
  { key: 'circles', label: 'Circles support' },
  { key: 'custom_domain', label: 'Custom domain' },
  { key: 'remove_branding', label: 'Hide “Powered by”' },
];

@Component({
  selector: 'app-admin-plans',
  imports: [FormsModule, LucideAngularModule, DecimalPipe, Modal],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Plans & pricing</h1>
        <p class="text-sm text-slate-500">Revenue models you can assign to any lab (and override per lab).</p>
      </div>
      <button class="btn-primary" (click)="edit()"><lucide-icon name="plus" class="size-4" /> New plan</button>
    </div>

    <div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      @for (p of admin.plans(); track p.id) {
        <article class="card flex flex-col p-5" [class.opacity-60]="!p.is_active">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-semibold tracking-wide text-brand uppercase">{{ modelLabel(p.billing_model) }}</p>
              <h3 class="mt-0.5 text-lg font-bold text-slate-800">{{ p.name }}</h3>
            </div>
            <span class="font-mono text-xs text-slate-400">{{ p.code }}</span>
          </div>
          <p class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            {{ priceLabel(p) }}
          </p>
          <ul class="mt-4 space-y-1.5 text-sm text-slate-600">
            <li class="flex items-center gap-2"><lucide-icon name="file-check" class="size-4 text-slate-400" /> {{ p.report_quota ? (p.report_quota | number) + ' reports / month' : 'Unlimited reports' }}</li>
            @if (p.setup_fee) { <li class="flex items-center gap-2"><lucide-icon name="receipt" class="size-4 text-slate-400" /> ₹{{ p.setup_fee | number }} setup</li> }
            @for (f of features; track f.key) {
              @if (p.features[f.key]) { <li class="flex items-center gap-2"><lucide-icon name="check" class="size-4 text-emerald-500" /> {{ f.label }}</li> }
            }
          </ul>
          <div class="mt-auto flex items-center justify-between pt-5">
            <span class="text-xs text-slate-400">{{ labsOn(p.id) }} lab(s)</span>
            <button class="btn-ghost !py-2 text-xs" (click)="edit(p)"><lucide-icon name="pencil" class="size-3.5" /> Edit</button>
          </div>
        </article>
      }
    </div>

    @if (form(); as f) {
      <app-modal [title]="f.id ? 'Edit plan' : 'New plan'" (closed)="form.set(null)" [width]="560">
        <form class="space-y-4" (ngSubmit)="save(f)">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label">Name</label><input class="input" name="n" [(ngModel)]="f.name" required /></div>
            <div><label class="label">Code</label><input class="input font-mono" name="c" [(ngModel)]="f.code" required /></div>
          </div>
          <div>
            <span class="label">Billing model</span>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              @for (m of models; track m.v) {
                <button type="button" class="rounded-xl border px-3 py-2 text-left transition"
                        [class]="f.billing_model === m.v ? 'border-brand bg-brand/5 ring-2 ring-brand/10' : 'border-slate-200 hover:border-slate-300'"
                        (click)="f.billing_model = m.v">
                  <b class="block text-xs text-slate-700">{{ m.l }}</b><span class="text-[11px] text-slate-400">{{ m.hint }}</span>
                </button>
              }
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><label class="label">Price ₹</label><input class="input" type="number" name="pr" [(ngModel)]="f.price" /></div>
            <div><label class="label">Per report ₹</label><input class="input" type="number" step="0.5" name="pf" [(ngModel)]="f.per_report_fee" /></div>
            <div><label class="label">Rev share %</label><input class="input" type="number" name="rs" [(ngModel)]="f.revenue_share_pct" /></div>
            <div><label class="label">Setup ₹</label><input class="input" type="number" name="sf" [(ngModel)]="f.setup_fee" /></div>
          </div>
          <div><label class="label">Monthly report quota (blank = unlimited)</label><input class="input" type="number" name="q" [(ngModel)]="f.report_quota" /></div>
          <div class="grid grid-cols-2 gap-2">
            @for (ft of features; track ft.key) {
              <label class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" class="size-4 accent-[var(--brand)]" [name]="ft.key" [(ngModel)]="f.features[ft.key]" /> {{ ft.label }}</label>
            }
            <label class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" class="size-4 accent-[var(--brand)]" name="act" [(ngModel)]="f.is_active" /> Plan active</label>
          </div>
          <button class="btn-primary w-full" type="submit" [disabled]="busy()"><lucide-icon name="save" class="size-4" /> Save plan</button>
        </form>
      </app-modal>
    }
  `,
})
export class AdminPlans {
  protected readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  protected readonly models = MODELS;
  protected readonly features = FEATURES;
  protected readonly form = signal<Partial<Plan> & { features: Record<string, boolean> } | null>(null);
  protected readonly busy = signal(false);

  modelLabel(m: BillingModel) {
    return MODELS.find((x) => x.v === m)?.l ?? m;
  }

  priceLabel(p: Plan) {
    switch (p.billing_model) {
      case 'monthly': return `₹${p.price.toLocaleString('en-IN')}/mo`;
      case 'yearly': return `₹${p.price.toLocaleString('en-IN')}/yr`;
      case 'per_report': return `₹${p.per_report_fee}/report`;
      case 'hybrid': return `₹${p.price}/mo + ₹${p.per_report_fee}`;
      case 'revenue_share': return `${p.revenue_share_pct}%`;
      default: return 'Free';
    }
  }

  labsOn(planId: string) {
    return this.admin.tenants().filter((t) => t.plan_id === planId).length;
  }

  edit(p?: Plan) {
    this.form.set(
      p
        ? structuredClone({ ...p, features: { ...(p.features ?? {}) } })
        : { name: '', code: '', billing_model: 'monthly', price: 0, per_report_fee: 0, revenue_share_pct: 0, setup_fee: 0, report_quota: null, is_active: true, features: {} },
    );
  }

  async save(f: Partial<Plan>) {
    this.busy.set(true);
    try {
      const num = (v: unknown) => (v === '' || v === null || v === undefined ? 0 : Number(v));
      await this.admin.savePlan({
        ...f,
        price: num(f.price),
        per_report_fee: num(f.per_report_fee),
        revenue_share_pct: num(f.revenue_share_pct),
        setup_fee: num(f.setup_fee),
        report_quota: f.report_quota === null || (f.report_quota as unknown) === '' ? null : Number(f.report_quota),
      });
      this.form.set(null);
      this.toast.success('Plan saved');
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
