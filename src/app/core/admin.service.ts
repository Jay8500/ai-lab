import { computed, inject, Injectable, signal } from '@angular/core';
import { BillingEvent, Plan, Profile, SupportTicket, Tenant, TenantSecrets } from './models';
import { SupabaseService } from './supabase.service';

export interface TenantStats {
  tenant_id: string;
  visits_total: number;
  visits_month: number;
  reports_month: number;
  visits_today: number;
  users: number;
  open_tickets: number;
  paid_total: number;
  due_total: number;
}

export interface TenantRow extends Tenant {
  plan?: Plan;
  stats?: TenantStats;
  trialEndsAt: Date;
  daysLeft: number | null;
  effectiveStatus: Tenant['status'];
  mrr: number;
}

/** Monthly recurring revenue a lab is worth under its plan (custom price overrides plan price). */
export function monthlyValue(t: Pick<Tenant, 'custom_price' | 'status'>, plan: Plan | undefined, reportsMonth = 0): number {
  if (!plan || t.status !== 'active') return 0;
  const base = t.custom_price ?? plan.price;
  switch (plan.billing_model) {
    case 'monthly':
      return base;
    case 'yearly':
      return Math.round(base / 12);
    case 'per_report':
      return plan.per_report_fee * reportsMonth;
    case 'hybrid':
      return base + plan.per_report_fee * reportsMonth;
    default:
      return 0;
  }
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly sb = inject(SupabaseService);

  readonly tenants = signal<Tenant[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly stats = signal<TenantStats[]>([]);
  readonly loaded = signal(false);

  readonly rows = computed<TenantRow[]>(() => {
    const plans = new Map(this.plans().map((p) => [p.id, p]));
    const stats = new Map(this.stats().map((s) => [s.tenant_id, s]));
    return this.tenants().map((t) => {
      const trialEndsAt = new Date(new Date(t.trial_started_at).getTime() + t.trial_days * 86_400_000);
      const daysLeft = t.status === 'trial' ? Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000) : null;
      const effectiveStatus: Tenant['status'] = t.status === 'trial' && daysLeft! <= 0 ? 'expired' : t.status;
      const plan = t.plan_id ? plans.get(t.plan_id) : undefined;
      const st = stats.get(t.id);
      return { ...t, plan, stats: st, trialEndsAt, daysLeft, effectiveStatus, mrr: monthlyValue(t, plan, st?.reports_month ?? 0) };
    });
  });

  readonly totals = computed(() => {
    const rows = this.rows();
    return {
      labs: rows.length,
      active: rows.filter((r) => r.effectiveStatus === 'active').length,
      trial: rows.filter((r) => r.effectiveStatus === 'trial').length,
      expired: rows.filter((r) => r.effectiveStatus === 'expired' || r.effectiveStatus === 'suspended').length,
      mrr: rows.reduce((s, r) => s + r.mrr, 0),
      collected: rows.reduce((s, r) => s + Number(r.stats?.paid_total ?? 0), 0),
      due: rows.reduce((s, r) => s + Number(r.stats?.due_total ?? 0), 0),
      reportsMonth: rows.reduce((s, r) => s + Number(r.stats?.reports_month ?? 0), 0),
      tickets: rows.reduce((s, r) => s + Number(r.stats?.open_tickets ?? 0), 0),
    };
  });

  async loadAll(): Promise<void> {
    const [t, p, s] = await Promise.all([
      this.sb.client.from('tenants').select('*').order('created_at', { ascending: false }),
      this.sb.client.from('plans').select('*').order('price'),
      this.sb.client.rpc('admin_tenant_stats'),
    ]);
    if (t.error) throw t.error;
    this.tenants.set((t.data ?? []) as Tenant[]);
    this.plans.set((p.data ?? []) as Plan[]);
    this.stats.set((s.data ?? []) as TenantStats[]);
    this.loaded.set(true);
  }

  async ensureLoaded() {
    if (!this.loaded()) await this.loadAll();
  }

  // ── Tenants ──
  async createTenant(input: Partial<Tenant>): Promise<Tenant> {
    const { data, error } = await this.sb.client.from('tenants').insert(input).select().single();
    if (error) throw new Error(error.message.includes('duplicate') ? 'That subdomain is already taken' : error.message);
    await this.sb.client.from('tenant_secrets').insert({ tenant_id: data.id });
    this.tenants.update((l) => [data as Tenant, ...l]);
    return data as Tenant;
  }

  async saveTenant(id: string, patch: Partial<Tenant>): Promise<Tenant> {
    const { data, error } = await this.sb.client.from('tenants').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message.includes('duplicate') ? 'Subdomain or custom domain already in use' : error.message);
    this.tenants.update((l) => l.map((t) => (t.id === id ? (data as Tenant) : t)));
    return data as Tenant;
  }

  async deleteTenant(id: string): Promise<void> {
    const { error } = await this.sb.client.from('tenants').delete().eq('id', id);
    if (error) throw new Error(error.message);
    this.tenants.update((l) => l.filter((t) => t.id !== id));
  }

  async getSecrets(tenantId: string): Promise<TenantSecrets> {
    const { data } = await this.sb.client.from('tenant_secrets').select('*').eq('tenant_id', tenantId).maybeSingle();
    return (data as TenantSecrets) ?? ({ tenant_id: tenantId, extra: {} } as TenantSecrets);
  }

  async saveSecrets(s: TenantSecrets): Promise<void> {
    const { error } = await this.sb.client
      .from('tenant_secrets')
      .upsert({ ...s, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  async uploadBranding(tenantId: string, kind: 'logo' | 'favicon' | 'cover', file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${tenantId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await this.sb.client.storage.from('branding').upload(path, file, { contentType: file.type, upsert: true });
    if (error) throw new Error(error.message);
    return this.sb.publicUrl('branding', path);
  }

  // ── Plans ──
  async savePlan(plan: Partial<Plan>): Promise<void> {
    const { error } = plan.id
      ? await this.sb.client.from('plans').update(plan).eq('id', plan.id)
      : await this.sb.client.from('plans').insert(plan);
    if (error) throw new Error(error.message);
    const { data } = await this.sb.client.from('plans').select('*').order('price');
    this.plans.set((data ?? []) as Plan[]);
  }

  // ── Users (via edge function, needs service role) ──
  async users(tenantId: string): Promise<Profile[]> {
    const res = await this.callUsers({ action: 'list', tenant_id: tenantId });
    return res.users ?? [];
  }

  async createUser(tenantId: string, u: { email: string; password: string; full_name: string; role: string }) {
    await this.callUsers({ action: 'create', tenant_id: tenantId, ...u });
  }

  async resetPassword(tenantId: string, userId: string, password: string) {
    await this.callUsers({ action: 'reset_password', tenant_id: tenantId, user_id: userId, password });
  }

  async removeUser(tenantId: string, userId: string) {
    await this.callUsers({ action: 'remove', tenant_id: tenantId, user_id: userId });
  }

  private async callUsers(body: Record<string, unknown>) {
    const { data, error } = await this.sb.client.functions.invoke('admin-users', { body });
    if (error) {
      let msg = error.message;
      try {
        msg = (await (error as { context?: Response }).context?.json())?.error ?? msg;
      } catch {
        /* keep generic message */
      }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  // ── Billing ──
  async billing(tenantId?: string): Promise<BillingEvent[]> {
    let q = this.sb.client.from('billing_events').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data } = await q;
    return (data ?? []) as BillingEvent[];
  }

  async addBilling(e: Partial<BillingEvent>): Promise<void> {
    const { error } = await this.sb.client.from('billing_events').insert(e);
    if (error) throw new Error(error.message);
  }

  async setBillingStatus(id: string, status: BillingEvent['status']): Promise<void> {
    const { error } = await this.sb.client
      .from('billing_events')
      .update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  // ── Support ──
  async tickets(): Promise<SupportTicket[]> {
    const { data } = await this.sb.client.from('support_tickets').select('*').order('created_at', { ascending: false });
    return (data ?? []) as SupportTicket[];
  }

  async setTicketStatus(id: string, status: SupportTicket['status']) {
    const { error } = await this.sb.client.from('support_tickets').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async screenshotUrl(path: string): Promise<string | null> {
    const { data } = await this.sb.client.storage.from('support').createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  }

  // ── Platform settings ──
  async setting<T>(key: string): Promise<T | null> {
    const { data } = await this.sb.client.from('platform_settings').select('value').eq('key', key).maybeSingle();
    return (data?.value as T) ?? null;
  }

  async saveSetting(key: string, value: unknown) {
    const { error } = await this.sb.client
      .from('platform_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
}
