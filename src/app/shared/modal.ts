import { Component, HostListener, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/** Centered dialog on desktop, bottom sheet on phones. */
@Component({
  selector: 'app-modal',
  imports: [LucideAngularModule],
  template: `
    <div class="animate-fade-in fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px]" (click)="closed.emit()"></div>
    <div class="fixed inset-x-0 bottom-0 z-50 flex justify-center sm:inset-0 sm:items-center sm:p-6 pointer-events-none">
      <div
        class="animate-fade-up pointer-events-auto flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        [style.max-width.px]="width()"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 class="text-lg font-bold text-slate-800">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="mt-0.5 text-sm text-slate-500">{{ subtitle() }}</p>
            }
          </div>
          <button class="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" (click)="closed.emit()" aria-label="Close">
            <lucide-icon name="x" class="size-5" />
          </button>
        </div>
        <div class="overflow-y-auto px-5 py-5 sm:px-6 pb-safe">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly width = input(520);
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEsc() {
    this.closed.emit();
  }
}
