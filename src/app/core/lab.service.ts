import { computed, inject, Injectable, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { TestItem, Visit, VisitStatus } from './models';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';
import { ToastService } from './toast.service';
import { clean } from './text-clean';

export interface NewVisit {
  patient_name: string;
  mobile: string;
  age: number | null;
  gender: 'M' | 'F' | 'O' | null;
  tests: TestItem[];
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

@Injectable({ providedIn: 'root' })
export class LabService {
  private readonly sb = inject(SupabaseService);
  private readonly tenantSvc = inject(TenantService);
  private readonly toast = inject(ToastService);
  private channel?: RealtimeChannel;

  readonly visits = signal<Visit[]>([]);
  readonly loading = signal(false);
  /** Add-patient modal, opened from header, bottom nav or empty state. */
  readonly addOpen = signal(false);
  /** Patient whose visit history is open (timeline modal). */
  readonly historyFor = signal<Visit | null>(null);
  /** Visit whose AI explanation is open. */
  readonly aiFor = signal<Visit | null>(null);

  readonly todays = computed(() => this.visits().filter((v) => new Date(v.created_at) >= startOfToday()));
  readonly active = computed(() => this.visits().filter((v) => v.status !== 'delivered' || new Date(v.created_at) >= startOfToday()));
  readonly kpis = computed(() => {
    const today = startOfToday();
    const all = this.visits();
    return {
      tokens: this.todays().length,
      processing: all.filter((v) => ['collected', 'in_lab', 'verified'].includes(v.status)).length,
      ready: all.filter((v) => v.status === 'ready').length,
      delivered: all.filter((v) => v.delivered_at && new Date(v.delivered_at) >= today).length,
      revenue: this.todays().reduce((s, v) => s + Number(v.amount || 0), 0),
    };
  });

  private get tenantId(): string {
    const id = this.tenantSvc.tenant()?.id;
    if (!id) throw new Error('No lab selected');
    return id;
  }

  /** Loads the last 7 days (dashboard working set) and subscribes to live changes. */
  async load(): Promise<void> {
    this.loading.set(true);
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await this.sb.client
      .from('visits')
      .select('*')
      .eq('tenant_id', this.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    this.loading.set(false);
    if (error) throw error;
    this.visits.set((data ?? []) as Visit[]);
    this.subscribe();
  }

  async search(term: string): Promise<Visit[]> {
    const q = term.trim().replace(/[%,()]/g, '');
    let query = this.sb.client.from('visits').select('*').eq('tenant_id', this.tenantId);
    if (q) query = query.or(`token.ilike.%${q}%,patient_name.ilike.%${q}%,mobile.ilike.%${q}%`);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []) as Visit[];
  }

  async add(v: NewVisit): Promise<Visit> {
    const amount = v.tests.reduce((s, t) => s + Number(t.price || 0), 0);
    const { data, error } = await this.sb.client
      .from('visits')
      .insert(clean({ ...v, tenant_id: this.tenantId, amount, token: '' }))
      .select()
      .single();
    if (error) throw new Error(this.friendly(error.message));
    this.upsertLocal(data as Visit);
    return data as Visit;
  }

  async setStatus(v: Visit, status: VisitStatus): Promise<void> {
    const patch: Partial<Visit> = { status };
    if (status === 'delivered') patch.delivered_at = new Date().toISOString();
    await this.patch(v.id, patch);
  }

  async uploadReport(v: Visit, file: File): Promise<Visit> {
    if (file.type !== 'application/pdf') throw new Error('Please choose a PDF file');
    if (file.size > 20 * 1024 * 1024) throw new Error('PDF must be under 20 MB');
    const rand = crypto.randomUUID().replace(/-/g, '');
    const path = `${v.tenant_id}/${v.id}/${rand}.pdf`;
    const { error } = await this.sb.client.storage.from('reports').upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    if (v.report_path) await this.sb.client.storage.from('reports').remove([v.report_path]);
    const updated = await this.patch(v.id, {
      report_path: path,
      report_name: file.name,
      report_uploaded_at: new Date().toISOString(),
      status: 'ready',
      ai_status: 'none',
      ai_summary: null,
      ai_error: null,
    });
    // Automatic AI explanation (skipped when the lab has turned the AI card off)
    if (this.tenantSvc.pages().show_ai !== false) void this.explain(updated);
    return updated;
  }

  /**
   * AI explanation of the report using the lab's own AI key. Runs automatically after an
   * upload, and from the "Explain with AI" button — same action either way. The card shows
   * a skeleton while it runs; the result arrives through the live visits feed.
   */
  async explain(v: Visit): Promise<void> {
    if (!v.report_path) {
      this.toast.warn('Upload the report PDF first.');
      return;
    }
    this.upsertLocal({ ...v, ai_status: 'pending', ai_error: null });
    const { data, error } = await this.sb.client.functions.invoke('explain-report', { body: { visit_id: v.id } });
    let msg: string | null = data?.error ?? null;
    if (error) {
      try {
        msg = (await (error as { context?: Response }).context?.json())?.error ?? error.message;
      } catch {
        msg = error.message;
      }
    }
    // Refresh this visit (status / summary / error) in case the live feed is slow
    const { data: fresh } = await this.sb.client.from('visits').select('*').eq('id', v.id).single();
    if (fresh) this.upsertLocal(fresh as Visit);
    if (msg) this.toast.warn(msg);
  }

  async markNotified(v: Visit): Promise<void> {
    const now = new Date().toISOString();
    await this.patch(v.id, { notified_at: now, delivered_at: now, status: 'delivered' });
  }

  async remove(v: Visit): Promise<void> {
    if (v.report_path) await this.sb.client.storage.from('reports').remove([v.report_path]);
    const { error } = await this.sb.client.from('visits').delete().eq('id', v.id);
    if (error) throw new Error(error.message);
    this.visits.update((list) => list.filter((x) => x.id !== v.id));
  }

  reportUrl(v: Pick<Visit, 'report_path'>): string | null {
    return v.report_path ? this.sb.publicUrl('reports', v.report_path) : null;
  }

  trackUrl(v: Pick<Visit, 'token'>): string {
    return this.tenantSvc.labUrl(this.tenantSvc.slug()!, `/track/${encodeURIComponent(v.token)}`);
  }

  shareText(v: Visit): string {
    const lab = this.tenantSvc.name();
    return `Hello ${v.patient_name}, your ${v.tests.map((t) => t.code).join(', ')} report from ${lab} is ready.\n\nToken: ${v.token}\nView & download: ${this.trackUrl(v)}`;
  }

  whatsappLink(v: Visit): string {
    const digits = (v.mobile ?? '').replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${phone}?text=${encodeURIComponent(this.shareText(v))}`;
  }

  private async patch(id: string, patch: Partial<Visit>): Promise<Visit> {
    const { data, error } = await this.sb.client.from('visits').update(clean(patch)).eq('id', id).select().single();
    if (error) throw new Error(this.friendly(error.message));
    this.upsertLocal(data as Visit);
    return data as Visit;
  }

  private upsertLocal(v: Visit) {
    this.visits.update((list) => {
      const i = list.findIndex((x) => x.id === v.id);
      if (i === -1) return [v, ...list];
      const copy = [...list];
      copy[i] = v;
      return copy;
    });
  }

  private subscribe() {
    if (this.channel) return;
    this.channel = this.sb.client
      .channel(`visits-${this.tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visits', filter: `tenant_id=eq.${this.tenantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id: string }).id;
            this.visits.update((l) => l.filter((x) => x.id !== id));
          } else {
            this.upsertLocal(payload.new as Visit);
          }
        },
      )
      .subscribe();
  }

  private friendly(msg: string): string {
    if (msg.includes('row-level security')) return 'Your lab subscription is inactive or the trial has ended. Contact SpreadApps.';
    return msg;
  }
}
