import { Component, computed, input } from '@angular/core';
import { TenantStatus } from '../core/models';

const TONES: Record<TenantStatus, string> = {
  active: 'border-emerald-100 bg-emerald-50 text-emerald-600',
  trial: 'border-amber-100 bg-amber-50 text-amber-600',
  suspended: 'border-slate-200 bg-slate-50 text-slate-500',
  expired: 'border-rose-100 bg-rose-50 text-rose-600',
};

@Component({
  selector: 'app-lab-status-pill',
  template: `<span class="pill capitalize {{ tone() }}">{{ status() }}</span>`,
})
export class LabStatusPill {
  readonly status = input.required<TenantStatus>();
  protected readonly tone = computed(() => TONES[this.status()]);
}
