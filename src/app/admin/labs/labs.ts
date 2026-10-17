import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService } from '../../core/admin.service';
import { DEFAULT_TESTS, TenantStatus } from '../../core/models';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { Modal } from '../../shared/modal';
import { LabStatusPill } from '../lab-status-pill';

@Component({
  selector: 'app-admin-labs',
  imports: [FormsModule, RouterLink, LucideAngularModule, DecimalPipe, Modal, LabStatusPill],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Labs</h1>
        <p class="text-sm text-slate-500">Every client lab, its subdomain, plan and trial.</p>
      </div>
      <button class="btn-primary" (click)="openNew()"><lucide-icon name="plus" class="size-4" /> New lab</button>
    </div>

    <div class="card mt-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div class="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1">
        @for (f of statusFilters; track f) {
          <button class="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize whitespace-nowrap transition"
                  [class]="status() === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="status.set(f)">{{ f }}</button>
        }
      </div>
      <div class="relative sm:ml-auto sm:w-64">
        <lucide-icon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input class="input !py-2 !pl-9" placeholder="Search labs" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      </div>
    </div>

    <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      @for (r of rows(); track r.id) {
        <article class="card animate-fade-up flex flex-col p-5 transition hover:shadow-md">
          <div class="flex items-start gap-3">
            @if (r.logo_url) {
              <img [src]="r.logo_url" alt="" class="size-11 rounded-xl bg-white object-contain ring-1 ring-slate-100" />
            } @else {
              <span class="grid size-11 place-items-center rounded-xl text-lg font-bold text-white" [style.background]="r.brand_color">{{ r.name[0] }}</span>
            }
            <div class="min-w-0 flex-1">
              <a [routerLink]="['/admin/labs', r.id]" class="block truncate font-bold text-slate-800 hover:text-brand">{{ r.name }}</a>
              <p class="truncate font-mono text-xs text-slate-400">{{ r.custom_domain || r.slug + '.spreadapps.in' }}</p>
            </div>
            <app-lab-status-pill [status]="r.effectiveStatus" />
          </div>
          <dl class="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
            <div><dt class="text-[10px] font-semibold text-slate-400 uppercase">Plan</dt><dd class="truncate text-xs font-bold text-slate-700">{{ r.plan?.name || '—' }}</dd></div>
            <div><dt class="text-[10px] font-semibold text-slate-400 uppercase">MRR</dt><dd class="text-xs font-bold text-slate-700">₹{{ r.mrr | number }}</dd></div>
            <div>
              <dt class="text-[10px] font-semibold text-slate-400 uppercase">{{ r.status === 'trial' ? 'Trial' : 'Visits/mo' }}</dt>
              <dd class="text-xs font-bold text-slate-700">{{ r.status === 'trial' ? (r.daysLeft! > 0 ? r.daysLeft + 'd left' : 'ended') : (r.stats?.visits_month ?? 0) }}</dd>
            </div>
          </dl>
          <div class="mt-4 flex gap-2">
            <a [routerLink]="['/admin/labs', r.id]" class="btn-ghost flex-1 !py-2 text-xs"><lucide-icon name="pencil" class="size-3.5" /> Configure</a>
            <a [href]="tenant.labUrl(r.slug, '/')" target="_blank" rel="noopener" class="btn-ghost !px-3 !py-2" title="Open cover page"><lucide-icon name="external-link" class="size-3.5" /></a>
          </div>
        </article>
      } @empty {
        <div class="card col-span-full py-14 text-center text-sm text-slate-400">No labs match.</div>
      }
    </div>

    @if (creating()) {
      <app-modal title="New lab" subtitle="Creates the client, its subdomain and a free trial" (closed)="creating.set(false)">
        <form class="space-y-4" (ngSubmit)="create()">
          <div>
            <label class="label" for="ln">Lab name</label>
            <input id="ln" class="input" name="name" [(ngModel)]="form.name" (ngModelChange)="autoSlug()" required placeholder="Sri Sai Diagnostics" />
          </div>
          <div>
            <label class="label" for="ls">Subdomain</label>
            <div class="flex items-center rounded-xl border border-slate-200 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
              <input id="ls" class="min-w-0 flex-1 rounded-xl bg-transparent px-3.5 py-2.5 font-mono text-sm outline-none" name="slug" [(ngModel)]="form.slug"
                     (ngModelChange)="slugTouched = true" required pattern="[a-z0-9][a-z0-9-]{1,40}" />
              <span class="pr-3.5 text-sm text-slate-400">.spreadapps.in</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="lp">Plan</label>
              <select id="lp" class="input" name="plan" [(ngModel)]="form.plan_id">
                @for (p of admin.plans(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
              </select>
            </div>
            <div>
              <label class="label" for="lt">Trial days</label>
              <input id="lt" class="input" type="number" min="0" name="trial" [(ngModel)]="form.trial_days" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="lc">Brand colour</label>
              <div class="flex items-center gap-2">
                <input id="lc" type="color" class="h-10 w-12 cursor-pointer rounded-lg border border-slate-200" name="color" [(ngModel)]="form.brand_color" />
                <input class="input font-mono" name="colorx" [(ngModel)]="form.brand_color" />
              </div>
            </div>
            <div>
              <label class="label" for="lk">Token prefix</label>
              <input id="lk" class="input font-mono uppercase" maxlength="5" name="prefix" [(ngModel)]="form.token_prefix" />
            </div>
          </div>
          <button class="btn-primary w-full" type="submit" [disabled]="busy()">
            <lucide-icon [name]="busy() ? 'loader-circle' : 'plus'" class="size-4" [class.animate-spin]="busy()" /> Create lab
          </button>
        </form>
      </app-modal>
    }
  `,
})
export class AdminLabs implements OnInit {
  protected readonly admin = inject(AdminService);
  protected readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statusFilters: ('all' | TenantStatus)[] = ['all', 'active', 'trial', 'expired', 'suspended'];
  protected readonly status = signal<'all' | TenantStatus>('all');
  protected readonly q = signal('');
  protected readonly creating = signal(false);
  protected readonly busy = signal(false);
  protected slugTouched = false;
  protected form = { name: '', slug: '', plan_id: '', trial_days: 14, brand_color: '#6366F1', token_prefix: '' };

  protected readonly rows = computed(() => {
    const q = this.q().toLowerCase();
    return this.admin
      .rows()
      .filter((r) => this.status() === 'all' || r.effectiveStatus === this.status())
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q));
  });

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('new')) this.openNew();
  }

  async openNew() {
    await this.admin.ensureLoaded();
    const trial = this.admin.plans().find((p) => p.code === 'trial') ?? this.admin.plans()[0];
    this.form = { name: '', slug: '', plan_id: trial?.id ?? '', trial_days: 14, brand_color: '#6366F1', token_prefix: '' };
    this.slugTouched = false;
    this.creating.set(true);
  }

  autoSlug() {
    if (!this.slugTouched) {
      this.form.slug = this.form.name.toLowerCase().replace(/diagnostics?|labs?|laborator(y|ies)/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20);
    }
    if (!this.form.token_prefix || this.form.token_prefix.length <= 3) {
      this.form.token_prefix = this.form.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    }
  }

  async create() {
    const slug = this.form.slug.trim().toLowerCase();
    if (!this.form.name.trim()) return this.toast.warn('Enter the lab name.');
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) return this.toast.warn('Subdomain: lowercase letters, numbers and dashes only.');
    if (!(Number(this.form.trial_days) >= 0)) return this.toast.warn('Trial days must be 0 or more.');
    if (!/^#[0-9a-f]{6}$/i.test(this.form.brand_color)) return this.toast.warn('Brand colour must look like #6366F1.');
    this.busy.set(true);
    try {
      const t = await this.admin.createTenant({
        name: this.form.name.trim(),
        slug: this.form.slug.trim().toLowerCase(),
        plan_id: this.form.plan_id || null,
        trial_days: Number(this.form.trial_days),
        brand_color: this.form.brand_color,
        token_prefix: (this.form.token_prefix || 'LAB').toUpperCase(),
        status: 'trial',
        test_catalog: DEFAULT_TESTS,
        pages: { show_track: true, show_ai: true, show_support: true, show_whatsapp: true, show_powered_by: true },
      });
      this.creating.set(false);
      this.toast.success(`${t.name} created`);
      this.router.navigate(['/admin/labs', t.id]);
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.busy.set(false);
    }
  }
}
