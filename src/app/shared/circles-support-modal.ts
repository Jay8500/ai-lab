import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { CirclesLogo } from './circles-logo';
import { FormField } from './form-field';
import { SupportService } from '../core/support.service';
import { TenantService } from '../core/tenant.service';
import { ToastService } from '../core/toast.service';

type Priority = 'low' | 'normal' | 'high' | 'urgent';

/** Slide-over "Raise a ticket" panel, powered by Circles. */
@Component({
  selector: 'app-circles-support',
  imports: [FormsModule, LucideAngularModule, CirclesLogo, FormField],
  template: `
    @if (support.open()) {
      <div class="animate-fade-in fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px]" (click)="close()"></div>
      <aside class="animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl" role="dialog" aria-label="Support">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-xl bg-slate-50 ring-1 ring-slate-100">
              <app-circles-logo [size]="24" />
            </span>
            <div>
              <h2 class="font-bold text-slate-800">Need help?</h2>
              <p class="text-xs text-slate-400">Raise a ticket · Powered by <b class="text-teal-600">Circles</b></p>
            </div>
          </div>
          <button class="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" (click)="close()" aria-label="Close">
            <lucide-icon name="x" class="size-5" />
          </button>
        </div>

        @if (ticketId()) {
          <div class="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <span class="grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-500">
              <lucide-icon name="circle-check" class="size-7" />
            </span>
            <h3 class="mt-4 text-lg font-bold text-slate-800">Ticket raised</h3>
            <p class="mt-1 text-sm text-slate-500">
              Reference <span class="font-mono font-semibold text-slate-700">#{{ ticketId() }}</span>. The SpreadApps team will get back to you.
            </p>
            <button class="btn-ghost mt-6" (click)="ticketId.set(null)">Raise another</button>
          </div>
        } @else {
          <form class="flex flex-1 flex-col overflow-y-auto" (ngSubmit)="submit()" novalidate>
            <div class="space-y-4 p-5">
              <div class="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Lab context: <span class="font-mono font-semibold text-slate-700">{{ tenant.slug() ?? 'platform' }}</span> — attached automatically
              </div>
              @let e = errors();
              <app-field label="Issue summary" for="ts" required [error]="e.summary" [counter]="summary.length + ' / 140'">
                <input id="ts" class="input" name="summary" [(ngModel)]="summary" maxlength="140" placeholder="e.g. PDF upload fails for large reports" />
              </app-field>
              <app-field label="Details" for="td" optional [error]="e.details" hint="Steps to repeat it help us fix it faster." [counter]="details.length ? details.length + ' / 2000' : ''">
                <textarea id="td" class="input min-h-28" name="details" [(ngModel)]="details" maxlength="2000" placeholder="What happened? What did you expect?"></textarea>
              </app-field>
              <div>
                <span class="label">Priority</span>
                <div class="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
                  @for (p of priorities; track p) {
                    <button
                      type="button"
                      class="rounded-lg py-1.5 text-xs font-semibold capitalize transition"
                      [class]="priority() === p ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'"
                      (click)="priority.set(p)"
                    >
                      {{ p }}
                    </button>
                  }
                </div>
              </div>
              <div>
                <span class="label">Screenshot (optional)</span>
                <label class="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-3.5 py-3 hover:border-slate-300">
                  <input type="file" accept="image/*" class="sr-only" (change)="pick($event)" />
                  @if (preview()) {
                    <img [src]="preview()" alt="" class="size-12 rounded-lg object-cover ring-1 ring-slate-100" />
                    <span class="min-w-0 flex-1 truncate text-xs font-semibold text-slate-600">{{ fileName() }}</span>
                  } @else {
                    <span class="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-500"><lucide-icon name="image" class="size-4" /></span>
                    <span class="text-xs text-slate-500">Attach a screenshot</span>
                  }
                </label>
              </div>
            </div>
            <div class="pb-safe mt-auto border-t border-slate-100 p-5">
              <button class="btn-primary w-full" type="submit" [disabled]="busy()">
                <lucide-icon [name]="busy() ? 'loader-circle' : 'send'" class="size-4" [class.animate-spin]="busy()" />
                Submit ticket
              </button>
            </div>
          </form>
        }
      </aside>
    }
  `,
})
export class CirclesSupport {
  protected readonly support = inject(SupportService);
  protected readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);

  protected readonly priorities: Priority[] = ['low', 'normal', 'high', 'urgent'];
  protected summary = '';
  protected details = '';
  private file: File | null = null;
  protected readonly fileName = signal('');
  protected readonly priority = signal<Priority>('normal');
  protected readonly preview = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly ticketId = signal<string | null>(null);

  close() {
    this.support.open.set(false);
  }

  pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (f && f.size > 5 * 1024 * 1024) {
      this.toast.warn('Screenshot must be under 5 MB.');
      return;
    }
    this.file = f;
    this.fileName.set(f?.name ?? '');
    this.preview.set(f ? URL.createObjectURL(f) : null);
  }

  protected readonly submitted = signal(false);

  errors(): { summary?: string; details?: string } {
    if (!this.submitted()) return {};
    const e: { summary?: string; details?: string } = {};
    const s = this.summary.replace(/\s+/g, ' ').trim();
    if (!s) e.summary = 'Add a short summary of the issue.';
    else if (s.length < 8) e.summary = 'A few more words, please — e.g. “Upload fails for big PDFs”.';
    if (this.details.trim() && this.details.trim().length < 10) e.details = 'Add a little more detail, or leave it empty.';
    return e;
  }

  async submit() {
    this.submitted.set(true);
    if (Object.keys(this.errors()).length) return this.toast.warn('Check the highlighted fields.');
    this.busy.set(true);
    try {
      const id = await this.support.submit({
        summary: this.summary.trim(),
        details: this.details.trim(),
        priority: this.priority(),
        screenshot: this.file,
      });
      this.ticketId.set(id);
      this.toast.success('Ticket raised.');
      this.summary = '';
      this.details = '';
      this.submitted.set(false);
      this.file = null;
      this.fileName.set('');
      this.preview.set(null);
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.busy.set(false);
    }
  }
}
