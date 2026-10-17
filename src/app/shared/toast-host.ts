import { Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [LucideAngularModule],
  template: `
    <div class="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="animate-fade-up pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-sm shadow-lg"
          [class.border-emerald-100]="t.kind === 'success'"
          [class.border-rose-100]="t.kind === 'error'"
          [class.border-slate-100]="t.kind === 'info'"
          role="status"
        >
          <lucide-icon
            [name]="t.kind === 'success' ? 'circle-check' : t.kind === 'error' ? 'triangle-alert' : 'info'"
            class="mt-0.5 size-4 shrink-0"
            [class.text-emerald-500]="t.kind === 'success'"
            [class.text-rose-500]="t.kind === 'error'"
            [class.text-brand]="t.kind === 'info'"
          />
          <span class="text-slate-700">{{ t.text }}</span>
          <button class="ml-1 text-slate-400 hover:text-slate-600" (click)="toasts.dismiss(t.id)" aria-label="Dismiss">
            <lucide-icon name="x" class="size-4" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
