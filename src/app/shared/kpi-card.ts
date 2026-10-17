import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-kpi-card',
  imports: [LucideAngularModule],
  template: `
    <div class="card h-full p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <p class="text-xs font-semibold text-slate-500 sm:text-sm">{{ label() }}</p>
        <span class="grid size-9 shrink-0 place-items-center rounded-xl {{ tone() }}">
          <lucide-icon [name]="icon()" class="size-[18px]" />
        </span>
      </div>
      <p class="mt-2 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">{{ value() }}</p>
      @if (hint()) {
        <p class="mt-1 text-xs text-slate-400">{{ hint() }}</p>
      }
    </div>
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('activity');
  readonly hint = input('');
  readonly tone = input('bg-brand/10 text-brand');
}
