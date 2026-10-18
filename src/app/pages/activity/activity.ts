import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ActivityRow, ActivityService } from '../../core/activity.service';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { Timeline } from '../../shared/timeline';

type Scope = 'me' | 'tenant' | 'platform' | 'all';

const FILTERS = [
  { v: '', l: 'Everything', icon: 'history' },
  { v: 'visit', l: 'Patients', icon: 'user-plus' },
  { v: 'task', l: 'Tasks', icon: 'list-todo' },
  { v: 'user', l: 'Logins', icon: 'user-round-plus' },
  { v: 'session', l: 'Sign-ins', icon: 'log-in' },
  { v: 'ticket', l: 'Support', icon: 'life-buoy' },
];

/** History of everything that happened, newest first, as a timeline. */
@Component({
  selector: 'app-activity',
  imports: [LucideAngularModule, Timeline],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900"><lucide-icon name="history" class="size-6 text-brand" /> Activity</h1>
        <p class="text-sm text-slate-500">Everything that happened, newest first.</p>
      </div>
      <button class="btn-ghost" (click)="reload()" [disabled]="loading()">
        <lucide-icon name="refresh-cw" class="size-4" [class.animate-spin]="loading()" /> Refresh
      </button>
    </div>

    <div class="card mt-5 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
      @if (scopes().length > 1) {
        <div class="flex gap-1 rounded-xl bg-slate-100/80 p-1">
          @for (s of scopes(); track s.v) {
            <button class="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition"
                    [class]="scope() === s.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'" (click)="setScope(s.v)">{{ s.l }}</button>
          }
        </div>
      }
      <div class="flex flex-wrap gap-1.5 lg:ml-auto">
        @for (f of filters; track f.v) {
          <button class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition"
                  [class]="entity() === f.v ? 'border-brand bg-brand/10 text-brand' : 'border-slate-200 bg-white text-slate-500 hover:text-slate-700'"
                  (click)="setEntity(f.v)">
            <lucide-icon [name]="f.icon" class="size-3.5" /> {{ f.l }}
          </button>
        }
      </div>
    </div>

    <div class="card mt-4 p-5 sm:p-6">
      @if (loading() && !rows().length) {
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="mb-4 flex animate-pulse gap-3"><div class="size-9 rounded-full bg-slate-100"></div><div class="h-9 flex-1 rounded bg-slate-100"></div></div>
        }
      } @else {
        <app-timeline [items]="items()" empty="No activity yet." />
        @if (more()) {
          <div class="mt-4 flex justify-center">
            <button class="btn-ghost py-2! text-xs" (click)="loadMore()" [disabled]="loading()">
              <lucide-icon [name]="loading() ? 'loader-circle' : 'history'" class="size-3.5" [class.animate-spin]="loading()" /> Show older
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class ActivityPage implements OnInit {
  private readonly activity = inject(ActivityService);
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);
  private readonly sb = inject(SupabaseService);
  private readonly toast = inject(ToastService);

  protected readonly filters = FILTERS;
  protected readonly rows = signal<ActivityRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly more = signal(false);
  protected readonly entity = signal('');
  private readonly people = signal(new Map<string, { name: string; avatar?: string | null }>());
  private readonly labs = signal(new Map<string, string>());

  protected readonly scopes = computed<{ v: Scope; l: string }[]>(() => {
    if (!this.tenant.tenant()) return [
      { v: 'all', l: 'Everything' },
      { v: 'platform', l: 'SpreadApps' },
      { v: 'me', l: 'Mine' },
    ];
    return this.auth.isOwner() ? [{ v: 'tenant', l: 'Whole lab' }, { v: 'me', l: 'Mine' }] : [{ v: 'me', l: 'Mine' }, { v: 'tenant', l: 'Patients' }];
  });
  protected readonly scope = signal<Scope>('me');

  protected readonly items = computed(() => this.activity.toItems(this.rows(), this.people(), this.tenant.tenant() ? undefined : this.labs()));

  async ngOnInit() {
    this.scope.set(this.scopes()[0].v);
    if (this.scope() === 'tenant' && !this.auth.isOwner()) this.entity.set('visit');
    await Promise.all([this.loadPeople(), this.reload()]);
  }

  setScope(s: Scope) {
    this.scope.set(s);
    // Staff can only see patient events of others
    if (s === 'tenant' && !this.auth.isOwner()) this.entity.set('visit');
    this.reload();
  }

  setEntity(e: string) {
    if (this.scope() === 'tenant' && !this.auth.isOwner() && e !== 'visit') {
      this.toast.info('Staff see their own activity and patient history.');
      return;
    }
    this.entity.set(e);
    this.reload();
  }

  async reload() {
    this.rows.set([]);
    await this.fetch();
  }

  async loadMore() {
    await this.fetch(this.rows()[this.rows().length - 1]?.created_at);
  }

  private async fetch(before?: string) {
    this.loading.set(true);
    try {
      const batch = await this.activity.list({
        scope: this.scope(),
        tenantId: this.tenant.tenant()?.id ?? null,
        userId: this.auth.profile()?.id,
        entity: this.entity() || undefined,
        before,
        limit: 50,
      });
      this.rows.update((r) => [...r, ...batch]);
      this.more.set(batch.length === 50);
    } catch (e) {
      this.toast.fail(e, 'Could not load activity.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPeople() {
    let q = this.sb.client.from('profiles').select('id, full_name, username, avatar_url');
    if (this.tenant.tenant()) q = q.eq('tenant_id', this.tenant.tenant()!.id);
    const [{ data }, labs] = await Promise.all([
      q,
      this.tenant.tenant() ? Promise.resolve({ data: [] as { id: string; name: string }[] }) : this.sb.client.from('tenants').select('id, name'),
    ]);
    this.people.set(new Map((data ?? []).map((p) => [p.id, { name: p.full_name || p.username || 'User', avatar: p.avatar_url }])));
    this.labs.set(new Map((labs.data ?? []).map((t: { id: string; name: string }) => [t.id, t.name])));
  }
}
