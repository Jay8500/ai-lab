import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TestItem } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

/** Lab admins maintain their own tests, prices and turnaround times. */
@Component({
  selector: 'app-lab-tests',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Tests & prices</h1>
        <p class="text-sm text-slate-500">Shown to reception when adding patients, and on your public page.</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-ghost" (click)="add()"><lucide-icon name="plus" class="size-4" /> Add test</button>
        <button class="btn-primary" (click)="save()" [disabled]="saving() || !dirty()">
          <lucide-icon [name]="saving() ? 'loader-circle' : 'save'" class="size-4" [class.animate-spin]="saving()" /> Save
        </button>
      </div>
    </div>

    <div class="card mt-5 p-4 sm:p-5">
      <div class="relative mb-3 sm:w-72">
        <lucide-icon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input class="input py-2! pl-9!" placeholder="Filter tests" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      </div>
      <div class="hidden grid-cols-[110px_1fr_120px_100px_40px] gap-2 px-1 pb-1 text-[11px] font-semibold text-slate-400 uppercase sm:grid">
        <span>Code <span class="text-rose-500">*</span></span><span>Test name <span class="text-rose-500">*</span></span><span>Price ₹ <span class="text-rose-500">*</span></span><span>Report in (hrs)</span><span></span>
      </div>
      <div class="space-y-2">
        @for (t of tests(); track $index; let i = $index) {
          @if (matches(t)) {
            @let e = rowErr(i);
            <div class="grid grid-cols-[1fr_1fr_40px] gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[110px_1fr_120px_100px_40px] sm:bg-transparent sm:p-0">
              <input class="input font-mono uppercase" [class.is-invalid]="!!e.code" [(ngModel)]="t.code" (ngModelChange)="dirty.set(true)" placeholder="CBP" maxlength="12" aria-label="Test code" />
              <input class="input col-span-2 sm:col-span-1" [class.is-invalid]="!!e.name" [(ngModel)]="t.name" (ngModelChange)="dirty.set(true)" placeholder="Complete Blood Picture" maxlength="80" aria-label="Test name" />
              <input class="input" type="number" min="0" [class.is-invalid]="!!e.price" [(ngModel)]="t.price" (ngModelChange)="dirty.set(true)" aria-label="Price" placeholder="₹" />
              <input class="input" type="number" min="1" [class.is-invalid]="!!e.tat" [(ngModel)]="t.tat_hours" (ngModelChange)="dirty.set(true)" aria-label="Report in hours" placeholder="hrs" />
              <button class="grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="remove(i)" title="Remove test">
                <lucide-icon name="trash-2" class="size-4" />
              </button>
            </div>
            @if (e.code || e.name || e.price || e.tat) {
              <p class="animate-fade-in -mt-1 flex items-start gap-1.5 px-1 text-xs font-medium text-rose-600" role="alert">
                <lucide-icon name="circle-x" class="mt-px size-3.5 shrink-0" /> {{ e.code || e.name || e.price || e.tat }}
              </p>
            }
          }
        } @empty {
          <p class="py-10 text-center text-sm text-slate-400">No tests yet — add your first one.</p>
        }
      </div>
      <p class="mt-4 text-xs text-slate-400">{{ tests().length }} test(s). Changes apply to new patient visits; existing visits keep their prices.</p>
    </div>
  `,
})
export class LabTests implements OnInit {
  private readonly sb = inject(SupabaseService);
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);

  protected readonly tests = signal<TestItem[]>([]);
  protected readonly q = signal('');
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);

  ngOnInit() {
    this.tests.set(structuredClone(this.tenant.tenant()?.test_catalog ?? []));
  }

  matches(t: TestItem) {
    const q = this.q().trim().toLowerCase();
    return !q || !t.code || t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
  }

  add() {
    this.q.set('');
    this.tests.update((l) => [...l, { code: '', name: '', price: 0, tat_hours: 6 }]);
    this.dirty.set(true);
  }

  remove(i: number) {
    this.tests.update((l) => l.filter((_, idx) => idx !== i));
    this.dirty.set(true);
  }

  protected readonly submitted = signal(false);

  /** Problems with one row (only after Save is pressed; blank rows are dropped on save). */
  rowErr(i: number): { code?: string; name?: string; price?: string; tat?: string } {
    if (!this.submitted()) return {};
    const t = this.tests()[i];
    const code = (t.code ?? '').trim();
    const name = (t.name ?? '').trim();
    if (!code && !name) return {};
    const e: { code?: string; name?: string; price?: string; tat?: string } = {};
    if (!code) e.code = 'Add a short code, e.g. CBP.';
    else if (!/^[A-Za-z0-9-]{2,12}$/.test(code)) e.code = 'Code: 2–12 letters, numbers or -.';
    else if (this.tests().some((x, j) => j < i && (x.code ?? '').trim().toUpperCase() === code.toUpperCase())) e.code = `Code ${code.toUpperCase()} is already used above.`;
    if (!name) e.name = 'Add the test name patients will see.';
    else if (name.length < 2) e.name = 'Test name is too short.';
    const p = t.price as unknown;
    if (p === '' || p === null || p === undefined || !(Number(p) >= 0)) e.price = 'Enter a price (0 or more).';
    else if (Number(p) > 100000) e.price = 'That price looks too high — check it.';
    const h = t.tat_hours as unknown;
    if (h !== '' && h !== null && h !== undefined && (!(Number(h) >= 1) || Number(h) > 720)) e.tat = 'Report time: 1 to 720 hours, or leave empty.';
    return e;
  }

  async save() {
    this.submitted.set(true);
    const bad = this.tests().some((_, i) => Object.keys(this.rowErr(i)).length);
    if (bad) {
      this.q.set('');
      return this.toast.warn('Fix the highlighted tests.');
    }
    const rows = this.tests().filter((t) => (t.code ?? '').trim() || (t.name ?? '').trim());

    const clean = rows.map((t) => ({
      code: t.code.trim().toUpperCase(),
      name: t.name.trim(),
      price: Number(t.price),
      tat_hours: Number(t.tat_hours) || undefined,
    }));
    this.saving.set(true);
    try {
      const { error } = await this.sb.client.rpc('update_test_catalog', { p_tests: clean });
      if (error) throw error;
      await this.tenant.refresh();
      this.tests.set(structuredClone(clean));
      this.dirty.set(false);
      this.submitted.set(false);
      this.toast.success('Tests saved.');
    } catch (e) {
      this.toast.fail(e, 'Could not save tests.');
    } finally {
      this.saving.set(false);
    }
  }
}
