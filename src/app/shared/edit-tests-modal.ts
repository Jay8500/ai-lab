import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DialogService } from '../core/dialog.service';
import { LabService } from '../core/lab.service';
import { TestItem, Visit } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { ToastService } from '../core/toast.service';
import { Modal } from './modal';

/** Add / remove tests on a registered visit (prescription changes). The bill updates with it. */
@Component({
  selector: 'app-edit-tests-modal',
  imports: [FormsModule, LucideAngularModule, Modal],
  template: `
    <app-modal [title]="'Tests · ' + visit().patient_name" [subtitle]="'#' + visit().token + ' · tick the tests on the prescription'" [width]="620" (closed)="closed.emit()">
      <input class="input py-2!" placeholder="Filter tests…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      <div class="mt-3 grid max-h-[50vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        @for (t of shown(); track t.code) {
          <button type="button" (click)="toggle(t)"
                  class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
                  [class]="has(t.code) ? 'border-brand bg-brand/5 ring-2 ring-brand/10' : 'border-slate-200 hover:border-slate-300'">
            <span class="grid size-5 shrink-0 place-items-center rounded-md border" [class]="has(t.code) ? 'border-brand bg-brand text-white' : 'border-slate-300'">
              @if (has(t.code)) { <lucide-icon name="check" class="size-3.5" /> }
            </span>
            <span class="min-w-0 flex-1"><b class="block text-sm text-slate-700">{{ t.code }}</b><span class="block truncate text-[11px] text-slate-400">{{ t.name }}</span></span>
            <span class="text-xs font-semibold text-slate-500">₹{{ t.price }}</span>
          </button>
        }
      </div>
      @if (added().length || removed().length) {
        <p class="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          @if (added().length) { <span class="text-emerald-700">+ {{ added().join(', ') }}</span> }
          @if (removed().length) { <span class="ml-2 text-rose-600">− {{ removed().join(', ') }}</span> }
        </p>
      }
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-slate-600">{{ picked().length }} test(s) · <b class="text-slate-800">₹{{ total().toLocaleString('en-IN') }}</b>
          @if (total() !== visit().amount) { <span class="text-xs text-slate-400"> (was ₹{{ visit().amount.toLocaleString('en-IN') }})</span> }
        </p>
        <span class="flex gap-2">
          <button class="btn-ghost" (click)="closed.emit()">Cancel</button>
          <button class="btn-primary" (click)="save()" [disabled]="busy() || (!added().length && !removed().length)">
            <lucide-icon [name]="busy() ? 'loader-circle' : 'save'" class="size-4" [class.animate-spin]="busy()" /> Update tests
          </button>
        </span>
      </div>
    </app-modal>
  `,
})
export class EditTestsModal implements OnInit {
  private readonly lab = inject(LabService);
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  readonly visit = input.required<Visit>();
  readonly closed = output<void>();

  protected readonly q = signal('');
  protected readonly picked = signal<TestItem[]>([]);
  protected readonly busy = signal(false);
  /** Catalogue + any ordered test no longer in the catalogue (so it can still be removed) */
  private readonly all = computed(() => {
    const cat = this.tenant.tenant()?.test_catalog ?? [];
    const extra = this.visit().tests.filter((t) => !cat.some((c) => c.code === t.code));
    return [...extra, ...cat];
  });
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter((t) => !q || t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  });
  protected readonly total = computed(() => this.picked().reduce((s, t) => s + Number(t.price || 0), 0));
  protected readonly added = computed(() => this.picked().filter((t) => !this.visit().tests.some((o) => o.code === t.code)).map((t) => t.code));
  protected readonly removed = computed(() => this.visit().tests.filter((o) => !this.picked().some((t) => t.code === o.code)).map((t) => t.code));

  ngOnInit() {
    this.picked.set([...this.visit().tests]);
  }
  has(code: string) {
    return this.picked().some((t) => t.code === code);
  }
  toggle(t: TestItem) {
    // Keep the price the patient was quoted for tests already on the visit
    const orig = this.visit().tests.find((o) => o.code === t.code);
    this.picked.update((p) => (p.some((x) => x.code === t.code) ? p.filter((x) => x.code !== t.code) : [...p, orig ?? t]));
  }

  async save() {
    if (!this.picked().length) return this.toast.warn('Keep at least one test on the visit.');
    if (this.removed().length && !(await this.dialog.confirm({
      title: 'Remove tests?',
      message: `${this.removed().join(', ')} will be removed from this visit and the bill. Results already entered for them are discarded (verified results are kept).`,
      confirmText: 'Remove & update', tone: 'warning',
    }))) return;
    this.busy.set(true);
    try {
      await this.lab.updateTests(this.visit(), this.picked());
      this.toast.success(`Tests updated · new total ₹${this.total().toLocaleString('en-IN')}`);
      this.closed.emit();
    } catch (e) {
      this.toast.fail(e, 'Could not update the tests.');
    } finally {
      this.busy.set(false);
    }
  }
}
