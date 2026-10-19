import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { SAMPLE_TYPES, TestItem, TestParam } from '../core/models';
import { templateFor } from '../core/test-templates';
import { DialogService } from '../core/dialog.service';
import { ToastService } from '../core/toast.service';
import { Modal } from './modal';

type Row = TestParam & { _low: string; _high: string; _lowF: string; _highF: string; _opts: string };

const num = (s: string): number | null => {
  const v = (s ?? '').toString().trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * Parameters of one test (what the technician enters and the report prints):
 * name, short code, unit, type, reference range (with female override), formula.
 */
@Component({
  selector: 'app-test-params-editor',
  imports: [FormsModule, LucideAngularModule, Modal],
  template: `
    <app-modal [title]="'Parameters · ' + test().name" subtitle="What the technician enters and the report prints" [width]="980" (closed)="closed.emit()">
      <div class="flex flex-wrap items-end gap-3">
        <label class="min-w-48 flex-1"><span class="label">Sample / tube</span>
          <select class="input" [(ngModel)]="sample"><option value="">— choose —</option>@for (s of samples; track s) { <option [value]="s">{{ s }}</option> }</select>
        </label>
        <label class="min-w-48 flex-1"><span class="label">Department</span>
          <input class="input" [(ngModel)]="department" placeholder="e.g. Haematology" maxlength="40" />
        </label>
        @if (template()) {
          <button type="button" class="btn-ghost" (click)="useTemplate()"><lucide-icon name="sparkles" class="size-4 text-violet-500" /> Use standard {{ test().code }} template</button>
        }
      </div>

      <div class="mt-4 overflow-x-auto rounded-xl border border-slate-100">
        <table class="w-full min-w-[880px] text-sm">
          <thead class="bg-slate-50 text-left text-[11px] font-semibold text-slate-500 uppercase">
            <tr>
              <th class="px-2 py-2">Code <span class="text-rose-500">*</span></th><th class="px-2 py-2">Name <span class="text-rose-500">*</span></th>
              <th class="px-2 py-2">Unit</th><th class="px-2 py-2">Type</th>
              <th class="px-2 py-2">Low</th><th class="px-2 py-2">High</th><th class="px-2 py-2" title="Female range, if different">♀ Low</th><th class="px-2 py-2">♀ High</th>
              <th class="px-2 py-2">Formula / options</th><th class="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (r of rows(); track $index; let i = $index) {
              @let e = errs()[i];
              <tr class="align-top">
                <td class="px-2 py-1.5"><input class="input w-24 py-1.5! font-mono text-xs uppercase" [class.is-invalid]="!!e?.key" [(ngModel)]="r.key" maxlength="16" /></td>
                <td class="px-2 py-1.5"><input class="input min-w-40 py-1.5! text-xs" [class.is-invalid]="!!e?.name" [(ngModel)]="r.name" maxlength="60" /></td>
                <td class="px-2 py-1.5"><input class="input w-24 py-1.5! text-xs" [(ngModel)]="r.unit" maxlength="16" /></td>
                <td class="px-2 py-1.5">
                  <select class="input w-24 py-1.5! text-xs" [(ngModel)]="r.type"><option value="number">Number</option><option value="text">Text</option><option value="option">Choice</option></select>
                </td>
                @if (r.type === 'number' || !r.type) {
                  <td class="px-2 py-1.5"><input class="input w-20 py-1.5! text-xs" [class.is-invalid]="!!e?.range" [(ngModel)]="r._low" inputmode="decimal" /></td>
                  <td class="px-2 py-1.5"><input class="input w-20 py-1.5! text-xs" [class.is-invalid]="!!e?.range" [(ngModel)]="r._high" inputmode="decimal" /></td>
                  <td class="px-2 py-1.5"><input class="input w-20 py-1.5! text-xs" [(ngModel)]="r._lowF" inputmode="decimal" /></td>
                  <td class="px-2 py-1.5"><input class="input w-20 py-1.5! text-xs" [(ngModel)]="r._highF" inputmode="decimal" /></td>
                  <td class="px-2 py-1.5"><input class="input min-w-36 py-1.5! font-mono text-xs" [class.is-invalid]="!!e?.formula" [(ngModel)]="r.formula" placeholder="e.g. TP - ALB" /></td>
                } @else {
                  <td colspan="4" class="px-2 py-1.5 text-xs text-slate-400">No range for {{ r.type === 'text' ? 'text' : 'choice' }} values</td>
                  <td class="px-2 py-1.5">
                    @if (r.type === 'option') {
                      <input class="input min-w-36 py-1.5! text-xs" [class.is-invalid]="!!e?.options" [(ngModel)]="r._opts" placeholder="Nil, Trace, +, ++" />
                    }
                  </td>
                }
                <td class="px-2 py-1.5 whitespace-nowrap">
                  <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" (click)="move(i, -1)" [disabled]="i === 0" title="Move up"><lucide-icon name="arrow-up" class="size-3.5" /></button>
                  <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="remove(i)" title="Remove"><lucide-icon name="trash-2" class="size-3.5" /></button>
                </td>
              </tr>
              @if (e) {
                <tr><td colspan="10" class="px-2 pb-2 text-xs font-medium text-rose-600">{{ e.key || e.name || e.range || e.formula || e.options }}</td></tr>
              }
            } @empty {
              <tr><td colspan="10" class="px-3 py-8 text-center text-sm text-slate-400">No parameters — the lab uploads this test's report as a PDF. Add parameters to enter results in AI-Lab.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" class="btn-ghost py-2! text-xs" (click)="add()"><lucide-icon name="plus" class="size-3.5" /> Add parameter</button>
        <p class="text-xs text-slate-400">Codes are also used to match analyzer results. Ranges are adult values — check them against your analyzer / kit inserts.</p>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn-ghost" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn-primary" (click)="save()"><lucide-icon name="check" class="size-4" /> Done</button>
      </div>
    </app-modal>
  `,
})
export class TestParamsEditor implements OnInit {
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  readonly test = input.required<TestItem>();
  readonly saved = output<TestItem>();
  readonly closed = output<void>();

  protected readonly samples = SAMPLE_TYPES;
  protected readonly rows = signal<Row[]>([]);
  protected readonly submitted = signal(false);
  protected sample = '';
  protected department = '';
  protected readonly template = computed(() => templateFor(this.test()));

  ngOnInit() {
    const t = this.test();
    this.sample = t.sample ?? '';
    this.department = t.department ?? '';
    this.rows.set((t.params ?? []).map((p) => this.toRow(p)));
  }

  private toRow(p: TestParam): Row {
    return { ...p, type: p.type ?? 'number', _low: str(p.low), _high: str(p.high), _lowF: str(p.low_f), _highF: str(p.high_f), _opts: (p.options ?? []).join(', ') };
  }

  async useTemplate() {
    const tpl = this.template();
    if (!tpl) return;
    if (this.rows().length && !(await this.dialog.confirm({ title: 'Replace parameters?', message: `Load the standard ${this.test().code} parameters and ranges. Your current rows will be replaced.`, confirmText: 'Load template', tone: 'warning' }))) return;
    this.rows.set(tpl.params.map((p) => this.toRow(p)));
    this.sample ||= tpl.sample;
    this.department ||= tpl.department;
    this.toast.info('Standard parameters loaded — review the ranges for your lab.');
  }

  add() {
    this.rows.update((r) => [...r, this.toRow({ key: '', name: '', unit: '', type: 'number' })]);
  }
  remove(i: number) {
    this.rows.update((r) => r.filter((_, j) => j !== i));
  }
  move(i: number, d: number) {
    this.rows.update((r) => {
      const c = [...r];
      [c[i], c[i + d]] = [c[i + d], c[i]];
      return c;
    });
  }

  errs(): ({ key?: string; name?: string; range?: string; formula?: string; options?: string } | null)[] {
    if (!this.submitted()) return [];
    const rows = this.rows();
    const keys = rows.map((r) => (r.key ?? '').trim().toUpperCase());
    return rows.map((r, i) => {
      const e: { key?: string; name?: string; range?: string; formula?: string; options?: string } = {};
      const k = keys[i];
      if (!k) e.key = 'Add a short code, e.g. HB.';
      else if (!/^[A-Z][A-Z0-9_]{0,15}$/.test(k)) e.key = 'Code: letters, numbers or _ (start with a letter).';
      else if (keys.indexOf(k) !== i) e.key = `Code ${k} is used twice.`;
      if (!(r.name ?? '').trim()) e.name = 'Add the name printed on the report.';
      if ((r.type ?? 'number') === 'number') {
        const vals = [num(r._low), num(r._high), num(r._lowF), num(r._highF)];
        if (vals.some((v) => Number.isNaN(v))) e.range = 'Ranges must be numbers (or empty).';
        else if (vals[0] != null && vals[1] != null && vals[0]! > vals[1]!) e.range = 'Low is higher than High.';
        else if (vals[2] != null && vals[3] != null && vals[2]! > vals[3]!) e.range = 'Female low is higher than female high.';
        const f = (r.formula ?? '').trim();
        if (f) {
          const used = f.toUpperCase().match(/[A-Z_][A-Z0-9_]*/g) ?? [];
          const missing = used.filter((u) => !keys.includes(u) || u === k);
          if (!/^[A-Za-z0-9_\s.+\-*/()]+$/.test(f)) e.formula = 'Use parameter codes, numbers and + − × ÷ ( ) only.';
          else if (missing.length) e.formula = `Unknown code in formula: ${missing.join(', ')}.`;
        }
      } else if (r.type === 'option' && !(r._opts ?? '').split(',').map((x) => x.trim()).filter(Boolean).length) {
        e.options = 'List the choices separated by commas.';
      }
      return Object.keys(e).length ? e : null;
    });
  }

  save() {
    this.submitted.set(true);
    if (this.errs().some(Boolean)) return this.toast.warn('Fix the highlighted parameters.');
    const params: TestParam[] = this.rows().map((r) => {
      const type = r.type ?? 'number';
      const p: TestParam = { key: r.key.trim().toUpperCase(), name: r.name.trim(), type };
      if ((r.unit ?? '').trim()) p.unit = r.unit!.trim();
      if (r.section) p.section = r.section;
      if (r.decimals != null) p.decimals = r.decimals;
      if (type === 'number') {
        p.low = num(r._low); p.high = num(r._high);
        if (num(r._lowF) != null) p.low_f = num(r._lowF);
        if (num(r._highF) != null) p.high_f = num(r._highF);
        if ((r.formula ?? '').trim()) p.formula = r.formula!.trim().toUpperCase();
      }
      if (type === 'option') p.options = r._opts.split(',').map((x) => x.trim()).filter(Boolean);
      return p;
    });
    const t = this.test();
    this.saved.emit({ ...t, params, sample: this.sample || undefined, department: this.department.trim() || undefined });
  }
}
