import { Component, computed, input } from '@angular/core';
import { VisitStatus } from '../core/models';

const MAP: Record<VisitStatus, { label: string; cls: string }> = {
  collected: { label: 'Sample Collected', cls: 'bg-blue-50 text-blue-600 border-blue-100' },
  in_lab: { label: 'In-Testing', cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  verified: { label: 'Verified', cls: 'bg-violet-50 text-violet-600 border-violet-100' },
  ready: { label: 'Report Ready', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  delivered: { label: 'Delivered', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

@Component({
  selector: 'app-status-pill',
  template: `<span class="pill {{ meta().cls }}"><span class="size-1.5 rounded-full bg-current"></span>{{ meta().label }}</span>`,
})
export class StatusPill {
  readonly status = input.required<VisitStatus>();
  protected readonly meta = computed(() => MAP[this.status()]);
}
