import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VISIT_STEPS, VisitStatus } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { BrandMark } from '../../shared/brand-mark';
import { Timeline, TimelineItem } from '../../shared/timeline';
import { lookFor, VISIT_EVENT_LABEL } from '../../core/activity.service';
import { renderMessage } from '../../core/inbox.service';
import { buildTrends, Trends } from '../../shared/trends';
import { ReportValue } from '../../core/models';

interface TrackHistory {
  events: { action: string; at: string }[];
  previous: { token: string; created_at: string; status: VisitStatus; tests: { code: string; name: string }[]; report_path: string | null; ai_values?: ReportValue[] | null }[];
}

interface TrackResult {
  token: string;
  /** true = only progress is shown until the patient proves it's theirs */
  locked?: boolean;
  access?: 'locked' | 'wrong' | 'blocked';
  can_verify?: boolean;
  patient_name: string;
  age: number | null;
  gender: string | null;
  tests: { code: string; name: string }[];
  status: VisitStatus;
  report_path: string | null;
  report_name: string | null;
  report_uploaded_at: string | null;
  ai_summary: string | null;
  ai_status?: string;
  ai_values?: ReportValue[] | null;
  created_at: string;
}

const ORDER: VisitStatus[] = ['collected', 'in_lab', 'verified', 'ready', 'delivered'];

/** Zero-login patient portal: /track/:token */
@Component({
  selector: 'app-track',
  imports: [FormsModule, RouterLink, LucideAngularModule, DatePipe, BrandMark, Timeline, Trends],
  templateUrl: './track.html',
})
export class TrackPage implements OnDestroy {
  readonly token = input<string>();
  /** ?k= secret key from the WhatsApp link / receipt QR */
  readonly k = input<string>();
  protected last4 = '';
  protected readonly verifying = signal(false);
  protected readonly tenant = inject(TenantService);
  private readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly steps = VISIT_STEPS;
  protected readonly result = signal<TrackResult | null>(null);
  protected readonly aiHtml = computed(() => renderMessage(this.result()?.ai_summary ?? ''));
  protected readonly history = signal<TrackHistory | null>(null);
  protected readonly trends = computed(() => {
    const r = this.result();
    if (!r) return [];
    return buildTrends([
      { at: r.created_at, token: r.token, values: r.ai_values },
      ...(this.history()?.previous ?? []).map((p) => ({ at: p.created_at, token: p.token, values: p.ai_values })),
    ]);
  });
  protected readonly loading = signal(false);
  protected readonly missing = signal(false);
  protected query = '';
  private timer?: ReturnType<typeof setInterval>;

  protected readonly stepIndex = computed(() => {
    const s = this.result()?.status;
    return s ? Math.min(ORDER.indexOf(s), 3) : -1;
  });
  protected readonly isReady = computed(() => ['ready', 'delivered'].includes(this.result()?.status ?? ''));
  protected readonly pdfUrl = computed(() => {
    const p = this.result()?.report_path;
    return p ? this.sb.publicUrl('reports', p) : null;
  });
  protected readonly maskedName = computed(() => {
    const n = this.result()?.patient_name ?? '';
    return n
      .split(' ')
      .map((w, i) => (i === 0 ? w : w[0] + '.'))
      .join(' ');
  });

  constructor() {
    effect(() => {
      const tk = this.token();
      this.query = tk ?? '';
      if (tk) this.lookup(tk);
    });
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  search() {
    const tk = this.query.trim().toUpperCase();
    if (!tk) return this.toast.warn('Enter the token from your receipt.');
    if (tk) this.router.navigate(['/track', tk]);
  }

  private async lookup(token: string) {
    const slug = this.tenant.slug();
    if (!slug) return;
    this.loading.set(true);
    this.missing.set(false);
    await this.fetch(slug, token);
    this.loading.set(false);
    clearInterval(this.timer);
    // Keep the status live until the report is ready
    this.timer = setInterval(() => {
      if (this.isReady() && this.result()?.ai_status !== 'pending') clearInterval(this.timer);
      else this.fetch(slug, token);
    }, 20_000);
  }

  /** Proof for this token, kept for this browser tab only */
  private proof(token: string): { key?: string; last4?: string } {
    const k = this.k();
    try {
      const saved = JSON.parse(sessionStorage.getItem('trk:' + token.toUpperCase()) ?? '{}');
      return { key: k || saved.key, last4: saved.last4 };
    } catch {
      return { key: k };
    }
  }
  private remember(token: string, p: { key?: string; last4?: string }) {
    try { sessionStorage.setItem('trk:' + token.toUpperCase(), JSON.stringify(p)); } catch { /* private mode */ }
  }

  async verify() {
    const token = this.result()?.token;
    const slug = this.tenant.slug();
    const digits = this.last4.replace(/\D/g, '');
    if (!token || !slug) return;
    if (digits.length !== 4) return this.toast.warn('Enter the last 4 digits of the mobile number you gave the lab.');
    this.verifying.set(true);
    this.remember(token, { ...this.proof(token), last4: digits });
    await this.fetch(slug, token);
    this.verifying.set(false);
    const r = this.result();
    if (r?.locked) {
      this.remember(token, { key: this.proof(token).key });
      if (r.access === 'blocked') this.toast.warn('Too many wrong tries. Please wait 15 minutes or use the link from the lab.');
      else this.toast.warn('Those digits don’t match the mobile number for this token.');
    } else {
      this.last4 = '';
    }
  }

  private async fetch(slug: string, token: string) {
    const p = this.proof(token);
    if (p.key && this.k()) this.remember(token, p);
    const args = { p_slug: slug, p_token: token, p_key: p.key ?? null, p_last4: p.last4 ?? null };
    const { data } = await this.sb.client.rpc('track_visit', args);
    // History only after access is granted (a wrong guess must not be counted twice); locked → progress only
    const unlocked = data && !(data as TrackResult).locked;
    const hist = await this.sb.client.rpc('track_history', unlocked ? args : { ...args, p_last4: null });
    this.result.set((data as TrackResult) ?? null);
    this.missing.set(!data);
    this.history.set((hist.data as TrackHistory) ?? null);
  }

  /** This visit's progress, newest first. */
  protected readonly progress = computed<TimelineItem[]>(() =>
    (this.history()?.events ?? []).map((e, i) => {
      const look = lookFor('visit', e.action);
      return { id: 'e' + i, at: e.at, title: VISIT_EVENT_LABEL[e.action] ?? 'Updated', icon: look.icon, tone: look.tone };
    }),
  );

  /** Earlier visits at this lab (same mobile number). */
  protected readonly earlier = computed<TimelineItem[]>(() =>
    (this.history()?.previous ?? []).map((p) => {
      const ready = !!p.report_path;
      return {
        id: p.token,
        at: p.created_at,
        title: (p.tests ?? []).map((t) => t.name || t.code).join(', ') || 'Lab visit',
        subtitle: ready ? 'Report available' : 'In progress',
        icon: ready ? 'file-check' : 'clock',
        tone: ready ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600',
        chips: ['#' + p.token],
        link: ready ? { label: 'Download PDF', href: this.sb.publicUrl('reports', p.report_path!) } : null,
      };
    }),
  );
}
