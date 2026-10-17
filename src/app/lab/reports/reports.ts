import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { LabService } from '../../core/lab.service';
import { Visit } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { StatusPill } from '../../shared/status-pill';

@Component({
  selector: 'app-lab-reports',
  imports: [FormsModule, LucideAngularModule, DatePipe, StatusPill],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Search reports</h1>
        <p class="text-sm text-slate-500">Find any patient visit by name, token or mobile number.</p>
      </div>
    </div>

    <form class="card mt-5 flex items-center gap-2 p-2" (ngSubmit)="run()">
      <lucide-icon name="search" class="ml-2 size-4 text-slate-400" />
      <input class="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" name="q" [(ngModel)]="q" placeholder="Name, token or mobile…" autocomplete="off" />
      <button class="btn-primary !py-2" type="submit" [disabled]="busy()">
        <lucide-icon [name]="busy() ? 'loader-circle' : 'search'" class="size-4" [class.animate-spin]="busy()" /> Search
      </button>
    </form>

    <div class="card mt-4 overflow-hidden">
      <!-- Desktop table -->
      <table class="hidden w-full text-sm md:table">
        <thead class="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold text-slate-500">
          <tr>
            <th class="px-5 py-3">Token</th>
            <th class="px-3 py-3">Patient</th>
            <th class="px-3 py-3">Tests</th>
            <th class="px-3 py-3">Date</th>
            <th class="px-3 py-3">Status</th>
            <th class="px-5 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (v of rows(); track v.id) {
            <tr class="transition hover:bg-slate-50/60">
              <td class="px-5 py-3 font-mono text-xs font-bold text-brand">{{ v.token }}</td>
              <td class="px-3 py-3">
                <p class="font-semibold text-slate-700">{{ v.patient_name }}</p>
                <p class="text-xs text-slate-400">{{ v.mobile || '—' }}</p>
              </td>
              <td class="px-3 py-3 text-xs text-slate-500">{{ codes(v) }}</td>
              <td class="px-3 py-3 text-xs text-slate-500">{{ v.created_at | date: 'MMM d, h:mm a' }}</td>
              <td class="px-3 py-3"><app-status-pill [status]="v.status" /></td>
              <td class="px-5 py-3">
                <div class="flex justify-end gap-1.5">
                  @if (lab.reportUrl(v); as url) {
                    <a class="btn-ghost !px-2.5 !py-1.5 text-xs" [href]="url" target="_blank" rel="noopener"><lucide-icon name="eye" class="size-3.5" /> PDF</a>
                  }
                  <button class="btn-ghost !px-2.5 !py-1.5 text-xs" (click)="copy(v)" title="Copy tracking link"><lucide-icon name="link" class="size-3.5" /></button>
                  @if (auth.isOwner()) {
                    <button class="btn-ghost !px-2.5 !py-1.5 text-xs hover:!text-rose-600" (click)="remove(v)" title="Delete visit"><lucide-icon name="trash-2" class="size-3.5" /></button>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>

      <!-- Mobile list -->
      <ul class="divide-y divide-slate-100 md:hidden">
        @for (v of rows(); track v.id) {
          <li class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-[11px] font-bold text-brand">{{ v.token }}</p>
              <p class="truncate font-semibold text-slate-700">{{ v.patient_name }}</p>
              <p class="text-xs text-slate-400">{{ codes(v) }} · {{ v.created_at | date: 'MMM d' }}</p>
            </div>
            <div class="flex flex-col items-end gap-1.5">
              <app-status-pill [status]="v.status" />
              @if (lab.reportUrl(v); as url) {
                <a class="text-xs font-semibold text-brand" [href]="url" target="_blank" rel="noopener">Open PDF</a>
              }
            </div>
          </li>
        }
      </ul>

      @if (!rows().length && !busy()) {
        <p class="px-5 py-12 text-center text-sm text-slate-400">No visits found.</p>
      }
    </div>
  `,
})
export class LabReports implements OnInit {
  protected readonly lab = inject(LabService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected q = '';
  protected readonly rows = signal<Visit[]>([]);
  protected readonly busy = signal(false);

  ngOnInit() {
    this.run();
  }

  async run() {
    this.busy.set(true);
    try {
      this.rows.set(await this.lab.search(this.q));
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  codes(v: Visit) {
    return v.tests.map((t) => t.code).join(', ');
  }

  async copy(v: Visit) {
    await navigator.clipboard.writeText(this.lab.trackUrl(v));
    this.toast.success('Tracking link copied');
  }

  async remove(v: Visit) {
    if (!confirm(`Delete visit ${v.token} for ${v.patient_name}? This also deletes the report PDF.`)) return;
    try {
      await this.lab.remove(v);
      this.rows.update((r) => r.filter((x) => x.id !== v.id));
      this.toast.success('Visit deleted');
    } catch (e) {
      this.toast.fail(e);
    }
  }
}
