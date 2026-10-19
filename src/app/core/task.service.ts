import { computed, inject, Injectable, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { Profile } from './models';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';
import { clean } from './text-clean';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  tenant_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  category: string | null;
  due_at: string | null;
  has_time: boolean;
  visit_token: string | null;
  assignee_id: string;
  created_by: string;
  completed_at: string | null;
  created_at: string;
}

export type TaskInput = Pick<Task, 'title' | 'description' | 'priority' | 'status' | 'category' | 'due_at' | 'has_time' | 'visit_token' | 'assignee_id'>;

export const LAB_CATEGORIES = ['Sample collection', 'Testing', 'Reporting', 'Patient follow-up', 'Equipment', 'Inventory', 'Billing', 'Admin', 'Other'];
export const PLATFORM_CATEGORIES = ['Onboarding', 'Sales', 'Support', 'Billing', 'Development', 'Admin', 'Other'];

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

const dayStart = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Which due-date bucket a task belongs to. */
export function dueGroup(t: Pick<Task, 'due_at' | 'has_time'>): DueGroup {
  if (!t.due_at) return 'none';
  const due = new Date(t.due_at);
  const today = dayStart();
  const dueDay = dayStart(due);
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  if (days < 0 || (t.has_time && due.getTime() < Date.now())) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

/**
 * Tasks for the current list: this lab's shared list, or the Spread Apps team list
 * in the admin console. Keeps itself in sync with Realtime.
 */
@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);
  private channel?: RealtimeChannel;
  private loadedFor: string | undefined;

  readonly tasks = signal<Task[]>([]);
  readonly team = signal<Profile[]>([]);
  readonly loading = signal(false);

  /** Lab id, or null for the Spread Apps team list. */
  readonly scope = computed(() => this.tenant.tenant()?.id ?? null);
  readonly categories = computed(() => (this.scope() ? LAB_CATEGORIES : PLATFORM_CATEGORIES));

  /** Open tasks assigned to me that are overdue or due today — for the menu badge. */
  readonly myDueCount = computed(() => {
    const me = this.auth.profile()?.id;
    return this.tasks().filter((t) => t.assignee_id === me && t.status !== 'done' && ['overdue', 'today'].includes(dueGroup(t))).length;
  });

  async load(force = false): Promise<void> {
    const key = this.scope() ?? 'platform';
    if (!force && this.loadedFor === key) return;
    this.loading.set(true);
    try {
      let q = this.sb.client.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
      q = this.scope() ? q.eq('tenant_id', this.scope()!) : q.is('tenant_id', null);
      const [{ data, error }, team] = await Promise.all([q, this.loadTeam()]);
      if (error) throw error;
      this.tasks.set((data ?? []) as Task[]);
      this.team.set(team);
      this.loadedFor = key;
      this.subscribe(key);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTeam(): Promise<Profile[]> {
    let q = this.sb.client.from('profiles').select('id, full_name, username, email, role, title, avatar_url, tenant_id').order('full_name');
    q = this.scope() ? q.eq('tenant_id', this.scope()!).in('role', ['lab_owner', 'lab_staff']) : q.in('role', ['super_admin', 'platform_admin']);
    const { data } = await q;
    return (data ?? []) as Profile[];
  }

  member(id: string | null | undefined): Profile | undefined {
    return this.team().find((p) => p.id === id);
  }

  async create(input: TaskInput): Promise<Task> {
    const { data, error } = await this.sb.client.from('tasks').insert(clean({ ...input, tenant_id: this.scope() })).select().single();
    if (error) throw error;
    this.upsertLocal(data as Task);
    return data as Task;
  }

  async update(id: string, patch: Partial<TaskInput>): Promise<Task> {
    const { data, error } = await this.sb.client.from('tasks').update(clean(patch)).eq('id', id).select().single();
    if (error) throw error;
    this.upsertLocal(data as Task);
    return data as Task;
  }

  async setStatus(t: Task, status: TaskStatus): Promise<void> {
    const prev = t.status;
    this.upsertLocal({ ...t, status }); // optimistic
    try {
      await this.update(t.id, { status });
    } catch (e) {
      this.upsertLocal({ ...t, status: prev });
      throw e;
    }
  }

  async remove(t: Task): Promise<void> {
    const { error } = await this.sb.client.from('tasks').delete().eq('id', t.id);
    if (error) throw error;
    this.tasks.update((l) => l.filter((x) => x.id !== t.id));
  }

  canEdit(t: Task): boolean {
    const me = this.auth.profile()?.id;
    return t.created_by === me || t.assignee_id === me || this.isManager();
  }

  canDelete(t: Task): boolean {
    return t.created_by === this.auth.profile()?.id || this.isManager();
  }

  private isManager(): boolean {
    return this.scope() ? this.auth.isOwner() : this.auth.isRoot();
  }

  private upsertLocal(t: Task) {
    this.tasks.update((list) => {
      const i = list.findIndex((x) => x.id === t.id);
      if (i === -1) return [t, ...list];
      const copy = [...list];
      copy[i] = t;
      return copy;
    });
  }

  private subscribe(key: string) {
    if (this.channel) this.sb.client.removeChannel(this.channel);
    const filter = this.scope() ? `tenant_id=eq.${this.scope()}` : undefined;
    this.channel = this.sb.client
      .channel(`tasks-${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', ...(filter ? { filter } : {}) }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as { id: string }).id;
          this.tasks.update((l) => l.filter((x) => x.id !== id));
          return;
        }
        const t = p.new as Task;
        if ((t.tenant_id ?? null) !== this.scope()) return;
        this.upsertLocal(t);
      })
      .subscribe();
  }
}
