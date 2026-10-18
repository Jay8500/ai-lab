import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { LabService } from '../core/lab.service';
import { DEFAULT_TESTS, TestItem, Visit } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { ToastService } from '../core/toast.service';
import { FormField } from './form-field';
import { Modal } from './modal';
import { CONSENT_VERSION } from '../pages/policy/policy';
import { ReceiptService } from '../core/receipt.service';

type Gender = 'M' | 'F' | 'O';
type PatientField = 'name' | 'mobile' | 'age' | 'tests' | 'consent';

@Component({
  selector: 'app-add-patient-modal',
  imports: [Modal, FormsModule, LucideAngularModule, FormField],
  template: `
    <app-modal
      [title]="created() ? 'Token generated' : 'Add new patient'"
      [subtitle]="created() ? '' : 'Register the visit and generate a token'"
      [width]="560"
      (closed)="closed.emit()"
    >
      @if (created(); as v) {
        <div class="py-2 text-center">
          <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-500">
            <lucide-icon name="badge-check" class="size-7" />
          </div>
          <p class="mt-4 text-sm text-slate-500">Token for {{ v.patient_name }}</p>
          <p class="mt-1 font-mono text-3xl font-extrabold tracking-wider text-brand">{{ v.token }}</p>
          <p class="mt-2 text-sm text-slate-500">{{ testCodes(v) }} · ₹{{ v.amount }}</p>
          <button class="btn-primary mt-6 w-full py-3!" (click)="receipt.print(v)"><lucide-icon name="printer" class="size-4" /> Print receipt</button>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <button class="btn-ghost" (click)="copy(v)"><lucide-icon name="copy" class="size-4" /> Copy tracking link</button>
            <button class="btn-ghost" (click)="reset()"><lucide-icon name="user-plus" class="size-4" /> Add another</button>
          </div>
        </div>
      } @else {
        <form class="space-y-4" (ngSubmit)="save()" novalidate>
          <app-field label="Patient name" for="pn" required [error]="show('name')" hint="As it should appear on the report.">
            <input id="pn" class="input" name="name" [(ngModel)]="name" (blur)="touch('name')" autocomplete="off" placeholder="e.g. Ravi Kumar" maxlength="80" />
          </app-field>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_.6fr_1fr]">
            <app-field class="col-span-2 sm:col-span-1" label="Mobile number" for="pm" optional [error]="show('mobile')" hint="Used to share the report on WhatsApp.">
              <input id="pm" class="input" name="mobile" [(ngModel)]="mobile" (blur)="touch('mobile')" inputmode="tel" maxlength="14" placeholder="98765 43210" />
            </app-field>
            <app-field label="Age" for="pa" optional [error]="show('age')">
              <input id="pa" class="input" name="age" [(ngModel)]="age" (blur)="touch('age')" type="number" min="0" max="120" placeholder="32" />
            </app-field>
            <div>
              <span class="label">Gender <span class="text-rose-500">*</span></span>
              <div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                @for (g of genders; track g.v) {
                  <button
                    type="button"
                    class="rounded-lg py-1.5 text-xs font-semibold transition"
                    [class]="gender() === g.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'"
                    (click)="gender.set(g.v)"
                  >
                    {{ g.l }}
                  </button>
                }
              </div>
            </div>
          </div>

          <div>
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <span class="label mb-0!">Select tests <span class="text-rose-500">*</span></span>
              <input
                class="w-36 rounded-lg border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-brand"
                placeholder="Filter tests…"
                name="filter"
                [ngModel]="filter()"
                (ngModelChange)="filter.set($event)"
              />
            </div>
            <div class="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              @for (t of visibleTests(); track t.code) {
                <button
                  type="button"
                  (click)="toggle(t)"
                  class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
                  [class]="isSelected(t) ? 'border-brand bg-brand/5 ring-2 ring-brand/10' : 'border-slate-200 hover:border-slate-300'"
                >
                  <span
                    class="grid size-5 shrink-0 place-items-center rounded-md border"
                    [class]="isSelected(t) ? 'border-brand bg-brand text-white' : 'border-slate-300'"
                  >
                    @if (isSelected(t)) {
                      <lucide-icon name="check" class="size-3.5" />
                    }
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold text-slate-700">{{ t.code }}</span>
                    <span class="block truncate text-[11px] text-slate-400">{{ t.name }}</span>
                  </span>
                  <span class="text-xs font-semibold text-slate-500">₹{{ t.price }}</span>
                </button>
              }
            </div>
          </div>

          @if (show('tests'); as te) {
            <p class="animate-fade-in -mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-600" role="alert">
              <lucide-icon name="circle-x" class="size-3.5" /> {{ te }}
            </p>
          }
          <div [class.field-invalid]="!!show('consent')">
            <label class="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed transition"
                   [class]="show('consent') ? 'border-rose-200 bg-rose-50/40 text-slate-700' : consent() ? 'border-emerald-200 bg-emerald-50/40 text-slate-700' : 'border-slate-200 text-slate-600'">
              <input type="checkbox" class="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" name="consent" [checked]="consent()" (change)="consent.set(!consent()); touch('consent')" />
              <span>
                <b>{{ minor() ? 'Parent / guardian consents' : 'Patient consents' }} <span class="text-rose-500">*</span></b> to the lab using these details to run the tests and share the report{{ tenantPages().show_ai !== false ? ', including an AI explanation' : '' }}, as described in the
                <a href="/privacy" target="_blank" rel="noopener" class="font-semibold text-brand hover:underline" (click)="$event.stopPropagation()">privacy notice</a>.
              </span>
            </label>
            @if (show('consent'); as ce) {
              <p class="animate-fade-in mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600" role="alert"><lucide-icon name="circle-x" class="size-3.5" /> {{ ce }}</p>
            }
          </div>
          <div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div class="text-sm">
              <p class="text-slate-500">{{ selected().length }} test(s)</p>
              <p class="text-lg font-bold text-slate-800">₹{{ total() }}</p>
            </div>
            <button type="submit" class="btn-primary" [disabled]="saving()">
              <lucide-icon [name]="saving() ? 'loader-circle' : 'zap'" class="size-4" [class.animate-spin]="saving()" />
              Generate token
            </button>
          </div>
        </form>
      }
    </app-modal>
  `,
})
export class AddPatientModal {
  private readonly lab = inject(LabService);
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);
  protected readonly receipt = inject(ReceiptService);
  readonly closed = output<void>();

  protected readonly genders: { v: Gender; l: string }[] = [
    { v: 'M', l: 'M' },
    { v: 'F', l: 'F' },
    { v: 'O', l: 'Other' },
  ];
  protected name = '';
  protected mobile = '';
  protected age: number | null = null;
  protected readonly gender = signal<Gender>('M');
  protected readonly filter = signal('');
  protected readonly selected = signal<TestItem[]>([]);
  protected readonly saving = signal(false);
  protected readonly created = signal<Visit | null>(null);

  private readonly catalog = computed(() => {
    const c = this.tenant.tenant()?.test_catalog;
    return c?.length ? c : DEFAULT_TESTS;
  });
  protected readonly visibleTests = computed(() => {
    const q = this.filter().toLowerCase();
    return this.catalog().filter((t) => !q || t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  });
  protected readonly total = computed(() => this.selected().reduce((s, t) => s + Number(t.price || 0), 0));

  isSelected(t: TestItem) {
    return this.selected().some((s) => s.code === t.code);
  }

  toggle(t: TestItem) {
    this.selected.update((l) => (this.isSelected(t) ? l.filter((s) => s.code !== t.code) : [...l, t]));
  }

  testCodes(v: Visit) {
    return v.tests.map((t) => t.code).join(', ');
  }

  protected readonly touched = signal<Record<string, boolean>>({});
  protected readonly consent = signal(false);
  protected readonly tenantPages = this.tenant.pages;
  /** Under 18 → guardian consent */
  minor() {
    const a = Number(this.age);
    return this.age !== null && (this.age as unknown) !== '' && Number.isFinite(a) && a < 18;
  }
  protected readonly submitted = signal(false);

  /** Rules for each field, with a message that explains how to fix it. */
  errors(): Partial<Record<PatientField, string>> {
    const e: Partial<Record<PatientField, string>> = {};
    const name = this.name.trim();
    if (!name) e.name = 'Patient name is required — it is printed on the report.';
    else if (name.length < 2) e.name = 'Enter the full name (at least 2 letters).';
    else if (/[0-9@#$%^&*_=+<>{}[\]\\|~]/.test(name)) e.name = 'Names can’t contain numbers or symbols.';

    const mobile = this.mobile.replace(/[\s-]/g, '');
    if (mobile && !/^(\+?91)?[6-9]\d{9}$/.test(mobile)) e.mobile = 'Enter a 10-digit Indian mobile number starting with 6–9, e.g. 98765 43210.';

    const age = this.age as unknown;
    if (age !== null && age !== '' && age !== undefined) {
      const n = Number(age);
      if (!Number.isInteger(n) || n < 0 || n > 120) e.age = 'Age must be a whole number from 0 to 120.';
    }
    if (!this.selected().length) e.tests = 'Select at least one test to generate a token.';
    if (!this.consent()) e.consent = this.minor() ? 'A parent or guardian must agree before registering a patient under 18.' : 'Ask the patient for consent and tick this box to continue.';
    return e;
  }

  show(f: PatientField): string | null {
    return this.submitted() || this.touched()[f] ? (this.errors()[f] ?? null) : null;
  }

  touch(f: PatientField) {
    this.touched.update((t) => ({ ...t, [f]: true }));
  }

  async save() {
    this.submitted.set(true);
    const count = Object.keys(this.errors()).length;
    if (count) return this.toast.warn(count === 1 ? 'One field needs attention.' : `${count} fields need attention.`);
    const mobile = this.mobile.replace(/[\s-]/g, '');
    this.saving.set(true);
    try {
      const v = await this.lab.add({
        patient_name: this.name.trim(),
        mobile,
        age: this.age ?? null,
        gender: this.gender(),
        tests: this.selected(),
        consent_at: new Date().toISOString(),
        consent_by: this.minor() ? 'guardian' : 'patient',
        consent_version: CONSENT_VERSION,
      });
      this.created.set(v);
      this.toast.success(`Token ${v.token} created`);
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.saving.set(false);
    }
  }

  async copy(v: Visit) {
    await navigator.clipboard.writeText(this.lab.trackUrl(v));
    this.toast.success('Tracking link copied');
  }

  reset() {
    this.name = '';
    this.mobile = '';
    this.age = null;
    this.selected.set([]);
    this.created.set(null);
    this.submitted.set(false);
    this.touched.set({});
    this.consent.set(false);
  }
}
