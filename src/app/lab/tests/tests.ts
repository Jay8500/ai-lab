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
        <input class="input !py-2 !pl-9" placeholder="Filter tests" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      </div>
      <div class="hidden grid-cols-[110px_1fr_120px_100px_40px] gap-2 px-1 pb-1 text-[11px] font-semibold text-slate-400 uppercase sm:grid">
        <span>Code</span><span>Test name</span><span>Price ₹</span><span>Report in (hrs)</span><span></span>
      </div>
      <div class="space-y-2">
        @for (t of tests(); track $index; let i = $index) {
          @if (matches(t)) {
            <div class="grid grid-cols-[1fr_1fr_40px] gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[110px_1fr_120px_100px_40px] sm:bg-transparent sm:p-0">
              <input class="input font-mono uppercase" [(ngModel)]="t.code" (ngModelChange)="dirty.set(true)" placeholder="CBP" maxlength="12" />
              <input class="input col-span-2 sm:col-span-1" [(ngModel)]="t.name" (ngModelChange)="dirty.set(true)" placeholder="Complete Blood Picture" />
              <input class="input" type="number" min="0" [(ngModel)]="t.price" (ngModelChange)="dirty.set(true)" />
              <input class="input" type="number" min="0" [(ngModel)]="t.tat_hours" (ngModelChange)="dirty.set(true)" />
              <button class="grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="remove(i)" title="Remove test">
                <lucide-icon name="trash-2" class="size-4" />
              </button>
            </div>
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

  async save() {
    const rows = this.tests().filter((t) => t.code.trim() || t.name.trim());
    if (rows.some((t) => !t.code.trim())) return this.toast.warn('Every test needs a code.');
    if (rows.some((t) => !t.name.trim())) return this.toast.warn('Every test needs a name.');
    const codes = rows.map((t) => t.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) return this.toast.warn('Two tests have the same code.');
    if (rows.some((t) => !(Number(t.price) >= 0))) return this.toast.warn('Prices must be 0 or more.');

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
      this.toast.success('Tests saved.');
    } catch (e) {
      this.toast.fail(e, 'Could not save tests.');
    } finally {
      this.saving.set(false);
    }
  }
}
