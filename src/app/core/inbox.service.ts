import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';
import { ToastService } from './toast.service';

export type AnnCategory = 'general' | 'payment' | 'feature' | 'maintenance' | 'trial';

export interface InboxItem {
  id: string;
  category: AnnCategory;
  subject: string;
  body: string;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

/** Look & feel per announcement type (badge, banner, icon). */
export const ANN_STYLE: Record<AnnCategory, { label: string; icon: string; pill: string; banner: string; iconBox: string }> = {
  general: { label: 'Update', icon: 'megaphone', pill: 'border-indigo-100 bg-indigo-50 text-indigo-600', banner: 'border-indigo-200 bg-indigo-50 text-indigo-800', iconBox: 'bg-indigo-100 text-indigo-600' },
  payment: { label: 'Payment', icon: 'credit-card', pill: 'border-amber-100 bg-amber-50 text-amber-700', banner: 'border-amber-200 bg-amber-50 text-amber-800', iconBox: 'bg-amber-100 text-amber-700' },
  feature: { label: 'New feature', icon: 'sparkles', pill: 'border-emerald-100 bg-emerald-50 text-emerald-600', banner: 'border-emerald-200 bg-emerald-50 text-emerald-800', iconBox: 'bg-emerald-100 text-emerald-600' },
  maintenance: { label: 'Maintenance', icon: 'triangle-alert', pill: 'border-rose-100 bg-rose-50 text-rose-600', banner: 'border-rose-200 bg-rose-50 text-rose-800', iconBox: 'bg-rose-100 text-rose-600' },
  trial: { label: 'Trial', icon: 'hourglass', pill: 'border-violet-100 bg-violet-50 text-violet-600', banner: 'border-violet-200 bg-violet-50 text-violet-800', iconBox: 'bg-violet-100 text-violet-600' },
};

/** Types important enough to show as a banner on every page until dismissed. */
const BANNER_TYPES: AnnCategory[] = ['payment', 'maintenance', 'trial'];

/** Plain text with **bold** and links → safe HTML paragraphs (same rules as the email). */
export function renderMessage(text: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  return text
    .split(/\n{2,}/)
    .map((p) => {
      let h = esc(p.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="font-semibold text-brand underline">$1</a>');
      return `<p>${h}</p>`;
    })
    .join('');
}

/** SpreadApps announcements addressed to the signed-in person (in-app inbox). */
@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);
  private channel?: RealtimeChannel;
  private planName = 'your plan';

  readonly items = signal<InboxItem[]>([]);
  readonly unread = computed(() => this.items().filter((i) => !i.read_at).length);
  /** Newest important message that hasn't been dismissed → banner. */
  readonly banner = computed(() => this.items().find((i) => BANNER_TYPES.includes(i.category) && !i.dismissed_at) ?? null);
  /** Message open in the reader modal. */
  readonly open = signal<InboxItem | null>(null);

  constructor() {
    effect(() => {
      const uid = this.auth.session()?.user.id;
      if (uid && this.auth.isLabUser()) this.start(uid);
      else this.stop();
    });
  }

  /** Replace {{name}}, {{lab}}… with this person's own details. */
  personalise(text: string): string {
    const t = this.tenant.tenant();
    const trialEnd = t?.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return text
      .replaceAll('{{name}}', (this.auth.profile()?.full_name || this.auth.profile()?.username || 'there').split(' ')[0])
      .replaceAll('{{lab}}', t?.name ?? '')
      .replaceAll('{{plan}}', this.planName)
      .replaceAll('{{trial_end}}', trialEnd)
      .replaceAll('{{lab_url}}', t ? this.tenant.labUrl(t.slug, '/') : '');
  }

  async markRead(item: InboxItem) {
    if (item.read_at) return;
    const now = new Date().toISOString();
    this.patchLocal(item.id, { read_at: now });
    await this.sb.client.from('announcement_recipients').update({ read_at: now }).eq('announcement_id', item.id).eq('user_id', this.auth.profile()!.id);
  }

  async dismiss(item: InboxItem) {
    const now = new Date().toISOString();
    this.patchLocal(item.id, { dismissed_at: now, read_at: item.read_at ?? now });
    await this.sb.client
      .from('announcement_recipients')
      .update({ dismissed_at: now, read_at: item.read_at ?? now })
      .eq('announcement_id', item.id)
      .eq('user_id', this.auth.profile()!.id);
  }

  async markAllRead() {
    const now = new Date().toISOString();
    const ids = this.items().filter((i) => !i.read_at).map((i) => i.id);
    if (!ids.length) return;
    this.items.update((l) => l.map((i) => (i.read_at ? i : { ...i, read_at: now })));
    await this.sb.client.from('announcement_recipients').update({ read_at: now }).in('announcement_id', ids).eq('user_id', this.auth.profile()!.id);
  }

  openItem(item: InboxItem) {
    this.open.set(item);
    this.markRead(item);
  }

  private async start(uid: string) {
    if (this.channel) return;
    await this.load(uid);
    this.loadPlan();
    this.channel = this.sb.client
      .channel(`inbox-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcement_recipients', filter: `user_id=eq.${uid}` }, async () => {
        const before = new Set(this.items().map((i) => i.id));
        await this.load(uid);
        const fresh = this.items().find((i) => !before.has(i.id));
        if (fresh) this.toast.show(`${ANN_STYLE[fresh.category].label}: ${this.personalise(fresh.subject)}`, fresh.category === 'maintenance' ? 'warning' : 'info', 6000);
      })
      .subscribe();
  }

  private stop() {
    if (this.channel) this.sb.client.removeChannel(this.channel);
    this.channel = undefined;
    this.items.set([]);
  }

  private async load(uid: string) {
    const { data } = await this.sb.client
      .from('announcement_recipients')
      .select('read_at, dismissed_at, announcements(id, category, subject, body, created_at)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);
    type Row = { read_at: string | null; dismissed_at: string | null; announcements: Omit<InboxItem, 'read_at' | 'dismissed_at'> | null };
    this.items.set(
      ((data ?? []) as unknown as Row[])
        .filter((r) => r.announcements)
        .map((r) => ({ ...r.announcements!, read_at: r.read_at, dismissed_at: r.dismissed_at })),
    );
  }

  private async loadPlan() {
    const id = this.tenant.tenant()?.id;
    if (!id) return;
    const { data } = await this.sb.client.from('tenants').select('plans(name)').eq('id', id).maybeSingle();
    const name = (data as unknown as { plans: { name: string } | null } | null)?.plans?.name;
    if (name) this.planName = name;
  }

  private patchLocal(id: string, patch: Partial<InboxItem>) {
    this.items.update((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const o = this.open();
    if (o?.id === id) this.open.set({ ...o, ...patch });
  }
}
