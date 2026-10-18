import { inject, Injectable } from '@angular/core';
import { TimelineItem } from '../shared/timeline';
import { SupabaseService } from './supabase.service';

export interface ActivityRow {
  id: number;
  tenant_id: string | null;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  summary: string;
  meta: Record<string, string>;
  created_at: string;
}

/** Icon + colour for each kind of event. */
const LOOK: Record<string, { icon: string; tone: string }> = {
  'visit:registered': { icon: 'user-plus', tone: 'bg-blue-100 text-blue-600' },
  'visit:in_lab': { icon: 'flask-conical', tone: 'bg-amber-100 text-amber-600' },
  'visit:verified': { icon: 'badge-check', tone: 'bg-violet-100 text-violet-600' },
  'visit:ready': { icon: 'file-check', tone: 'bg-emerald-100 text-emerald-600' },
  'visit:report_uploaded': { icon: 'file-check', tone: 'bg-emerald-100 text-emerald-600' },
  'visit:report_sent': { icon: 'send', tone: 'bg-teal-100 text-teal-600' },
  'visit:delivered': { icon: 'send', tone: 'bg-teal-100 text-teal-600' },
  'task:created': { icon: 'list-todo', tone: 'bg-indigo-100 text-indigo-600' },
  'task:completed': { icon: 'circle-check', tone: 'bg-emerald-100 text-emerald-600' },
  'task:reassigned': { icon: 'users', tone: 'bg-slate-100 text-slate-600' },
  'user:created': { icon: 'user-round-plus', tone: 'bg-sky-100 text-sky-600' },
  'session:signed_in': { icon: 'log-in', tone: 'bg-slate-100 text-slate-500' },
  'session:signed_out': { icon: 'log-out', tone: 'bg-slate-100 text-slate-500' },
  'ticket:raised': { icon: 'life-buoy', tone: 'bg-rose-100 text-rose-600' },
  'ticket:feedback': { icon: 'message-square-heart', tone: 'bg-pink-100 text-pink-600' },
  'ticket:lead': { icon: 'calendar-clock', tone: 'bg-emerald-100 text-emerald-600' },
  'lab:created': { icon: 'building-2', tone: 'bg-brand/15 text-brand' },
  'billing:invoice': { icon: 'receipt', tone: 'bg-amber-100 text-amber-700' },
  'billing:paid': { icon: 'circle-check', tone: 'bg-emerald-100 text-emerald-600' },
  'billing:submitted': { icon: 'send', tone: 'bg-sky-100 text-sky-600' },
  'billing:rejected': { icon: 'circle-x', tone: 'bg-rose-100 text-rose-600' },
  'announcement:sent': { icon: 'megaphone', tone: 'bg-indigo-100 text-indigo-600' },
};

/** Patient-portal labels for visit events. */
export const VISIT_EVENT_LABEL: Record<string, string> = {
  registered: 'Sample registered',
  in_lab: 'Testing started',
  verified: 'Results verified',
  ready: 'Report ready',
  report_uploaded: 'Report ready',
  report_sent: 'Report sent to you',
  delivered: 'Report delivered',
};

export function lookFor(entity: string, action: string) {
  return LOOK[`${entity}:${action}`] ?? { icon: 'circle-dot', tone: 'bg-slate-100 text-slate-500' };
}

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly sb = inject(SupabaseService);

  /** Activity newest → oldest. scope: 'me' | a lab id | 'platform' | 'all'. */
  async list(opts: { scope: 'me' | 'tenant' | 'platform' | 'all'; tenantId?: string | null; userId?: string; entity?: string; before?: string; limit?: number }): Promise<ActivityRow[]> {
    let q = this.sb.client.from('activity_log').select('*').order('created_at', { ascending: false }).limit(opts.limit ?? 60);
    if (opts.scope === 'me' && opts.userId) q = q.eq('actor_id', opts.userId);
    if (opts.scope === 'tenant' && opts.tenantId) q = q.eq('tenant_id', opts.tenantId);
    if (opts.scope === 'platform') q = q.is('tenant_id', null);
    if (opts.entity) q = q.eq('entity', opts.entity);
    if (opts.before) q = q.lt('created_at', opts.before);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ActivityRow[];
  }

  /** Events for specific visits (patient history in the lab). */
  async forVisits(visitIds: string[]): Promise<ActivityRow[]> {
    if (!visitIds.length) return [];
    const { data, error } = await this.sb.client
      .from('activity_log')
      .select('*')
      .eq('entity', 'visit')
      .in('entity_id', visitIds)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ActivityRow[];
  }

  toItems(rows: ActivityRow[], people: Map<string, { name: string; avatar?: string | null }>, labs?: Map<string, string>): TimelineItem[] {
    return rows.map((r) => {
      const look = lookFor(r.entity, r.action);
      const who = r.actor_id ? people.get(r.actor_id) : undefined;
      const chips = [r.meta?.['token'] ? '#' + r.meta['token'] : '', labs && r.tenant_id ? (labs.get(r.tenant_id) ?? '') : ''].filter(Boolean);
      return { id: r.id, at: r.created_at, title: r.summary, icon: look.icon, tone: look.tone, chips, actorName: who?.name, actorAvatar: who?.avatar };
    });
  }

  /** Fire-and-forget app events (sign in / out). */
  log(action: 'signed_in' | 'signed_out') {
    this.sb.client.rpc('log_event', { p_action: action }).then(
      () => undefined,
      () => undefined,
    );
  }
}
