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

interface TrackResult {
  token: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  tests: { code: string; name: string }[];
  status: VisitStatus;
  report_path: string | null;
  report_name: string | null;
  report_uploaded_at: string | null;
  ai_summary: string | null;
  created_at: string;
  mobile_hint: string;
}

const ORDER: VisitStatus[] = ['collected', 'in_lab', 'verified', 'ready', 'delivered'];

/** Zero-login patient portal: /track/:token */
@Component({
  selector: 'app-track',
  imports: [FormsModule, RouterLink, LucideAngularModule, DatePipe, BrandMark],
  templateUrl: './track.html',
})
export class TrackPage implements OnDestroy {
  readonly token = input<string>();
  protected readonly tenant = inject(TenantService);
  private readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly steps = VISIT_STEPS;
  protected readonly result = signal<TrackResult | null>(null);
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
      if (this.isReady()) clearInterval(this.timer);
      else this.fetch(slug, token);
    }, 20_000);
  }

  private async fetch(slug: string, token: string) {
    const { data } = await this.sb.client.rpc('track_visit', { p_slug: slug, p_token: token });
    this.result.set((data as TrackResult) ?? null);
    this.missing.set(!data);
  }
}
