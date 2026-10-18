import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ActivityService, lookFor, VISIT_EVENT_LABEL } from '../core/activity.service';
import { LabService } from '../core/lab.service';
import { Visit } from '../core/models';
import { SupabaseService } from '../core/supabase.service';
import { Modal } from './modal';
import { Timeline, TimelineItem } from './timeline';
import { buildTrends, Trends } from './trends';

/** All visits of one patient (same mobile, or same name when no mobile) as a timeline. */
@Component({
  selector: 'app-patient-history',
  imports: [LucideAngularModule, DatePipe, Modal, Timeline, Trends],
  template: `
    @if (lab.historyFor(); as v) {
      <app-modal [title]="v.patient_name" [subtitle]="subtitle()" [width]="600" (closed)="lab.historyFor.set(null)">
        <div class="mb-5 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-slate-50 p-3"><p class="text-xl font-bold text-slate-800">{{ visits().length }}</p><p class="text-[11px] text-slate-500">Visits</p></div>
          <div class="rounded-xl bg-slate-50 p-3"><p class="text-xl font-bold text-slate-800">{{ reports() }}</p><p class="text-[11px] text-slate-500">Reports</p></div>
          <div class="rounded-xl bg-slate-50 p-3"><p class="text-sm font-bold text-slate-800">{{ firstVisit() | date: 'MMM y' }}</p><p class="text-[11px] text-slate-500">Patient since</p></div>
        </div>
        @if (loading()) {
          <div class="flex justify-center py-8"><lucide-icon name="loader-circle" class="size-6 animate-spin text-slate-300" /></div>
        } @else {
          @if (trends().length) {
            <section class="mb-5 rounded-2xl border border-violet-100 bg-violet-50/30 px-4 pt-3 pb-2">
              <h3 class="flex items-center gap-2 text-sm font-bold text-slate-800"><lucide-icon name="trending-up" class="size-4 text-violet-600" /> Trends across visits</h3>
              <p class="text-xs text-slate-400">Read from the reports by AI · green band = normal range. Check the PDF before advising.</p>
              <app-trends [series]="trends()" />
            </section>
          }
          <app-timeline [items]="items()" empty="No history yet." />
        }
      </app-modal>
    }
  `,
})
export class PatientHistory {
  protected readonly lab = inject(LabService);
  private readonly activity = inject(ActivityService);
  private readonly sb = inject(SupabaseService);

  protected readonly visits = signal<Visit[]>([]);
  protected readonly items = signal<TimelineItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly trends = computed(() => buildTrends(this.visits().map((x) => ({ at: x.created_at, token: x.token, values: x.ai_values }))));
  protected readonly reports = computed(() => this.visits().filter((v) => v.report_path).length);
  protected readonly firstVisit = computed(() => this.visits().at(-1)?.created_at ?? null);
  protected readonly subtitle = computed(() => {
    const v = this.lab.historyFor();
    if (!v) return '';
    const bits = [v.mobile ? '•••• ' + v.mobile.slice(-4) : 'No mobile on file', v.age ? v.age + ' yrs' : '', v.gender ?? ''].filter(Boolean);
    return 'Patient history · ' + bits.join(' · ');
  });

  constructor() {
    effect(() => {
      const v = this.lab.historyFor();
      if (v) this.load(v);
    });
  }

  private async load(v: Visit) {
    this.loading.set(true);
    this.items.set([]);
    try {
      let q = this.sb.client.from('visits').select('*').eq('tenant_id', v.tenant_id).order('created_at', { ascending: false }).limit(50);
      q = v.mobile ? q.eq('mobile', v.mobile) : q.ilike('patient_name', v.patient_name).is('mobile', null);
      const { data } = await q;
      const visits = (data ?? []) as Visit[];
      this.visits.set(visits);
      const events = await this.activity.forVisits(visits.map((x) => x.id));
      const byId = new Map(visits.map((x) => [x.id, x]));
      this.items.set(
        events.map((e) => {
          const visit = byId.get(e.entity_id!)!;
          const look = lookFor('visit', e.action);
          const isReport = (e.action === 'report_uploaded' || e.action === 'ready') && visit?.report_path;
          return {
            id: e.id,
            at: e.created_at,
            title: VISIT_EVENT_LABEL[e.action] ?? e.summary,
            icon: look.icon,
            tone: look.tone,
            chips: ['#' + (visit?.token ?? ''), visit?.tests.map((t) => t.code).join(', ') ?? ''].filter((c) => c && c !== '#'),
            link: isReport ? { label: 'Report PDF', href: this.lab.reportUrl(visit)! } : null,
          };
        }),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
