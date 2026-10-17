import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { LabService } from '../core/lab.service';
import { DEFAULT_TESTS, TestItem, Visit } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { ToastService } from '../core/toast.service';
import { Modal } from './modal';

type Gender = 'M' | 'F' | 'O';

@Component({
  selector: 'app-add-patient-modal',
  imports: [Modal, FormsModule, LucideAngularModule],
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
          <div class="mt-6 grid gap-2 sm:grid-cols-2">
            <button class="btn-ghost" (click)="copy(v)"><lucide-icon name="copy" class="size-4" /> Copy tracking link</button>
            <button class="btn-primary" (click)="reset()"><lucide-icon name="user-plus" class="size-4" /> Add another</button>
          </div>
        </div>
      } @else {
        <form class="space-y-4" (ngSubmit)="save()">
          <div>
            <label class="label" for="pn">Patient name</label>
            <input id="pn" class="input" name="name" [(ngModel)]="name" required autocomplete="off" placeholder="e.g. Ravi Kumar" />
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_.6fr_1fr]">
            <div class="col-span-2 sm:col-span-1">
              <label class="label" for="pm">Mobile number</label>
              <input id="pm" class="input" name="mobile" [(ngModel)]="mobile" inputmode="tel" maxlength="13" placeholder="98765 43210" />
            </div>
            <div>
              <label class="label" for="pa">Age</label>
              <input id="pa" class="input" name="age" [(ngModel)]="age" type="number" min="0" max="120" placeholder="32" />
            </div>
            <div>
              <span class="label">Gender</span>
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
              <span class="label !mb-0">Select tests</span>
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

          <div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div class="text-sm">
              <p class="text-slate-500">{{ selected().length }} test(s)</p>
              <p class="text-lg font-bold text-slate-800">₹{{ total() }}</p>
            </div>
            <button type="submit" class="btn-primary" [disabled]="!name.trim() || !selected().length || saving()">
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

  async save() {
    if (!this.name.trim() || !this.selected().length) return;
    this.saving.set(true);
    try {
      const v = await this.lab.add({
        patient_name: this.name.trim(),
        mobile: this.mobile.replace(/\s/g, ''),
        age: this.age ?? null,
        gender: this.gender(),
        tests: this.selected(),
      });
      this.created.set(v);
    } catch (e) {
      this.toast.error((e as Error).message);
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
  }
}
