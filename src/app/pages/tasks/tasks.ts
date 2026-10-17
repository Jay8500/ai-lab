import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { DueGroup, dueGroup, Task, TaskService } from '../../core/task.service';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../shared/avatar';
import { TaskForm } from './task-form';

type View = 'mine' | 'assigned' | 'all';

const GROUPS: { key: DueGroup; label: string; tone: string }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'text-rose-600' },
  { key: 'today', label: 'Today', tone: 'text-brand' },
  { key: 'tomorrow', label: 'Tomorrow', tone: 'text-slate-700' },
  { key: 'week', label: 'This week', tone: 'text-slate-700' },
  { key: 'later', label: 'Later', tone: 'text-slate-700' },
  { key: 'none', label: 'No due date', tone: 'text-slate-500' },
];

const PRIORITY_STYLE: Record<string, string> = {
  low: 'border-slate-200 bg-slate-50 text-slate-500',
  normal: 'border-sky-100 bg-sky-50 text-sky-600',
  high: 'border-amber-100 bg-amber-50 text-amber-600',
  urgent: 'border-rose-100 bg-rose-50 text-rose-600',
};

/** Shared to-do list: a lab's team (lab workspace) or the SpreadApps team (admin console). */
@Component({
  selector: 'app-tasks',
  imports: [FormsModule, LucideAngularModule, Avatar, TaskForm],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Tasks</h1>
        <p class="text-sm text-slate-500">{{ tasks.scope() ? 'Plan, schedule and share work with your lab team.' : 'The SpreadApps team’s to-do list.' }}</p>
      </div>
      <button class="btn-primary" (click)="openNew()"><lucide-icon name="plus" class="size-4" /> New task</button>
    </div>

    <!-- At a glance -->
    <div class="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      @for (s of stats(); track s.label) {
        <button class="card flex items-center gap-3 p-4 text-left transition hover:shadow-md" (click)="s.action()">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl {{ s.tone }}"><lucide-icon [name]="s.icon" class="size-5" /></span>
          <span><span class="block text-2xl leading-none font-bold text-slate-800">{{ s.value }}</span><span class="text-xs text-slate-500">{{ s.label }}</span></span>
        </button>
      }
    </div>

    <!-- Toolbar -->
    <div class="card mt-5 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
      <div class="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1">
        @for (v of views; track v.key) {
          <button class="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition"
                  [class]="view() === v.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'" (click)="view.set(v.key)">
            {{ v.label }} <span class="ml-1 text-slate-400">{{ viewCount(v.key) }}</span>
          </button>
        }
      </div>
      <div class="flex gap-1 rounded-xl bg-slate-100/80 p-1">
        @for (s of ['open', 'done']; track s) {
          <button class="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition"
                  [class]="show() === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'" (click)="show.set($any(s))">{{ s }}</button>
        }
      </div>
      <select class="input w-auto! py-2! text-xs" [ngModel]="cat()" (ngModelChange)="cat.set($event)" aria-label="Filter by category">
        <option value="">All categories</option>
        @for (c of tasks.categories(); track c) { <option [value]="c">{{ c }}</option> }
      </select>
      <div class="relative lg:ml-auto lg:w-64">
        <lucide-icon name="search" class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input class="input py-2! pl-9!" placeholder="Search tasks" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      </div>
    </div>

    <!-- Quick add -->
    <form class="mt-3 flex items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-3 py-1.5 transition focus-within:border-brand/40 focus-within:bg-white"
          (ngSubmit)="quickAdd()">
      <lucide-icon name="plus" class="size-4 shrink-0 text-slate-400" />
      <input class="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400" name="quick" [ngModel]="quick()" (ngModelChange)="quick.set($event)"
             placeholder="Quick add a task for yourself, due today — press Enter" maxlength="120" autocomplete="off" />
      @if (quick().trim()) {
        <button type="submit" class="btn-primary px-3! py-1.5! text-xs" [disabled]="adding()">Add</button>
      }
    </form>

    <!-- Grouped list -->
    <div class="mt-5 space-y-6">
      @if (tasks.loading() && !tasks.tasks().length) {
        @for (i of [1, 2, 3]; track i) { <div class="card h-16 animate-pulse"></div> }
      } @else {
        @for (g of grouped(); track g.key) {
          <section>
            <h2 class="mb-2 flex items-center gap-2 px-1 text-xs font-bold tracking-wider uppercase {{ g.tone }}">
              {{ g.label }} <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{{ g.items.length }}</span>
            </h2>
            <div class="card divide-y divide-slate-100">
              @for (t of g.items; track t.id) {
                @let who = tasks.member(t.assignee_id);
                <div class="group flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50/70" [class.opacity-60]="t.status === 'done'">
                  <button class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition"
                          [class]="t.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'"
                          (click)="toggle(t)" [disabled]="!tasks.canEdit(t)" [attr.aria-label]="t.status === 'done' ? 'Mark as not done' : 'Mark as done'">
                    @if (t.status === 'done') { <lucide-icon name="check" class="size-3" /> }
                  </button>
                  <button class="min-w-0 flex-1 text-left" (click)="openEdit(t)">
                    <p class="text-sm font-semibold text-slate-800" [class.line-through]="t.status === 'done'">{{ t.title }}</p>
                    @if (t.description) { <p class="mt-0.5 line-clamp-1 text-xs text-slate-500">{{ t.description }}</p> }
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span class="pill {{ priorityStyle[t.priority] }}">{{ t.priority }}</span>
                      @if (t.status === 'in_progress') { <span class="pill border-violet-100 bg-violet-50 text-violet-600">In progress</span> }
                      @if (t.due_at) {
                        <span class="inline-flex items-center gap-1 font-medium" [class]="dueGroup(t) === 'overdue' && t.status !== 'done' ? 'text-rose-600' : 'text-slate-500'">
                          <lucide-icon name="calendar" class="size-3" /> {{ dueLabel(t) }}
                        </span>
                      }
                      @if (t.category) { <span class="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{{ t.category }}</span> }
                      @if (t.visit_token) { <span class="rounded-md bg-brand/10 px-1.5 py-0.5 font-mono font-bold text-brand">#{{ t.visit_token }}</span> }
                    </div>
                  </button>
                  <div class="flex shrink-0 items-center gap-2" [title]="'Assigned to ' + (who?.full_name || who?.username || 'someone')">
                    <span class="hidden text-xs text-slate-500 sm:inline">{{ t.assignee_id === me() ? 'Me' : (who?.full_name || who?.username || '—') }}</span>
                    <app-avatar [name]="who?.full_name || who?.username" [url]="who?.avatar_url" [size]="28" />
                  </div>
                </div>
              }
            </div>
          </section>
        } @empty {
          <div class="card flex flex-col items-center px-6 py-14 text-center">
            <span class="grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><lucide-icon name="circle-check" class="size-7" /></span>
            <h3 class="mt-4 font-bold text-slate-800">{{ show() === 'done' ? 'Nothing completed yet' : 'All clear!' }}</h3>
            <p class="mt-1 max-w-xs text-sm text-slate-500">
              {{ q() || cat() ? 'No tasks match your filters.' : show() === 'done' ? 'Finished tasks will show up here.' : 'No open tasks here. Add one above to plan your day.' }}
            </p>
          </div>
        }
      }
    </div>

    @if (editing() !== undefined) {
      <app-task-form [task]="editing() ?? null" (closed)="editing.set(undefined)" />
    }
  `,
})
export class TasksPage implements OnInit {
  protected readonly tasks = inject(TaskService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly views: { key: View; label: string }[] = [
    { key: 'mine', label: 'My tasks' },
    { key: 'assigned', label: 'Assigned by me' },
    { key: 'all', label: 'All' },
  ];
  protected readonly priorityStyle = PRIORITY_STYLE;
  protected readonly dueGroup = dueGroup;

  protected readonly view = signal<View>('mine');
  protected readonly show = signal<'open' | 'done'>('open');
  protected readonly q = signal('');
  protected readonly cat = signal('');
  protected readonly quick = signal('');
  protected readonly adding = signal(false);
  /** undefined = closed, null = new task, Task = editing */
  protected readonly editing = signal<Task | null | undefined>(undefined);

  protected readonly me = computed(() => this.auth.profile()?.id ?? '');

  private inView(t: Task, v: View) {
    if (v === 'mine') return t.assignee_id === this.me();
    if (v === 'assigned') return t.created_by === this.me() && t.assignee_id !== this.me();
    return true;
  }

  viewCount(v: View) {
    return this.tasks.tasks().filter((t) => t.status !== 'done' && this.inView(t, v)).length;
  }

  protected readonly visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.tasks
      .tasks()
      .filter((t) => this.inView(t, this.view()))
      .filter((t) => (this.show() === 'done' ? t.status === 'done' : t.status !== 'done'))
      .filter((t) => !this.cat() || t.category === this.cat())
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q) || (t.visit_token ?? '').toLowerCase().includes(q));
  });

  protected readonly grouped = computed(() => {
    const items = this.visible();
    if (this.show() === 'done') {
      const done = [...items].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
      return done.length ? [{ key: 'done', label: 'Completed', tone: 'text-emerald-600', items: done }] : [];
    }
    const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
    return GROUPS.map((g) => ({
      ...g,
      items: items
        .filter((t) => dueGroup(t) === g.key)
        .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? '') || rank[a.priority] - rank[b.priority]),
    })).filter((g) => g.items.length);
  });

  protected readonly stats = computed(() => {
    const mine = this.tasks.tasks().filter((t) => t.assignee_id === this.me());
    const open = mine.filter((t) => t.status !== 'done');
    const weekAgo = Date.now() - 7 * 86_400_000;
    const goMine = () => {
      this.view.set('mine');
      this.show.set('open');
    };
    return [
      { label: 'Overdue', value: open.filter((t) => dueGroup(t) === 'overdue').length, icon: 'triangle-alert', tone: 'bg-rose-50 text-rose-600', action: goMine },
      { label: 'Due today', value: open.filter((t) => dueGroup(t) === 'today').length, icon: 'calendar', tone: 'bg-brand/10 text-brand', action: goMine },
      { label: 'My open tasks', value: open.length, icon: 'list-todo', tone: 'bg-amber-50 text-amber-600', action: goMine },
      {
        label: 'Done this week',
        value: mine.filter((t) => t.completed_at && new Date(t.completed_at).getTime() > weekAgo).length,
        icon: 'circle-check',
        tone: 'bg-emerald-50 text-emerald-600',
        action: () => {
          this.view.set('mine');
          this.show.set('done');
        },
      },
    ];
  });

  async ngOnInit() {
    try {
      await this.tasks.load(true);
    } catch (e) {
      this.toast.fail(e, 'Could not load tasks.');
    }
  }

  openNew() {
    this.editing.set(null);
  }

  openEdit(t: Task) {
    this.editing.set(t);
  }

  dueLabel(t: Task): string {
    const d = new Date(t.due_at!);
    const g = dueGroup(t);
    const time = t.has_time ? ' · ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
    const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    if (g === 'today') return 'Today' + time;
    if (g === 'tomorrow') return 'Tomorrow' + time;
    if (g === 'overdue') return 'Overdue · ' + date + time;
    return date + time;
  }

  async toggle(t: Task) {
    const next = t.status === 'done' ? 'todo' : 'done';
    try {
      await this.tasks.setStatus(t, next);
      if (next === 'done') this.toast.success('Nice work — task completed.');
    } catch (e) {
      this.toast.fail(e, 'Could not update the task.');
    }
  }

  async quickAdd() {
    const title = this.quick().trim();
    if (!title) return;
    if (title.length < 3) return this.toast.warn('Task title needs at least 3 characters.');
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    this.adding.set(true);
    try {
      await this.tasks.create({
        title,
        description: null,
        assignee_id: this.me(),
        category: null,
        priority: 'normal',
        status: 'todo',
        due_at: end.toISOString(),
        has_time: false,
        visit_token: null,
      });
      this.quick.set('');
      this.toast.success('Added to today.');
    } catch (e) {
      this.toast.fail(e, 'Could not add the task.');
    } finally {
      this.adding.set(false);
    }
  }
}
