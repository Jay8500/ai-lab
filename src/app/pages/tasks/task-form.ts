import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { Task, TaskInput, TaskPriority, TaskService, TaskStatus } from '../../core/task.service';
import { ToastService } from '../../core/toast.service';
import { FormField } from '../../shared/form-field';
import { Modal } from '../../shared/modal';

type Field = 'title' | 'description' | 'assignee' | 'date' | 'time' | 'token';

const TITLE_MAX = 120;
const DESC_MAX = 1000;

const PRIORITIES: { v: TaskPriority; l: string; dot: string }[] = [
  { v: 'low', l: 'Low', dot: 'bg-slate-400' },
  { v: 'normal', l: 'Normal', dot: 'bg-sky-500' },
  { v: 'high', l: 'High', dot: 'bg-amber-500' },
  { v: 'urgent', l: 'Urgent', dot: 'bg-rose-500' },
];
const STATUSES: { v: TaskStatus; l: string }[] = [
  { v: 'todo', l: 'To do' },
  { v: 'in_progress', l: 'In progress' },
  { v: 'done', l: 'Done' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

@Component({
  selector: 'app-task-form',
  imports: [FormsModule, LucideAngularModule, Modal, FormField],
  template: `
    <app-modal [title]="task() ? 'Edit task' : 'New task'" [subtitle]="readOnly() ? 'You can view this task, but only its creator, assignee or an admin can change it.' : 'Fields marked * are required.'"
               [width]="600" (closed)="closed.emit()">
      <form class="space-y-4" (ngSubmit)="save()" novalidate>
        <app-field label="Title" for="tf-title" required [error]="show('title')" [counter]="title().length + ' / ' + titleMax" [counterOver]="title().length > titleMax"
                   hint="A short action, e.g. “Calibrate the CBC analyser” or “Call Ravi about his thyroid report”.">
          <input id="tf-title" class="input" name="title" [ngModel]="title()" (ngModelChange)="title.set($event)" (blur)="touch('title')"
                 [attr.aria-invalid]="!!show('title')" autocomplete="off" [disabled]="readOnly()" placeholder="What needs to be done?" />
        </app-field>

        <app-field label="Details" for="tf-desc" optional [error]="show('description')" [counter]="description().length ? description().length + ' / ' + descMax : ''"
                   [counterOver]="description().length > descMax" hint="Steps, notes or anything the assignee should know.">
          <textarea id="tf-desc" class="input min-h-24" name="desc" [ngModel]="description()" (ngModelChange)="description.set($event)" (blur)="touch('description')"
                    [disabled]="readOnly()" placeholder="Add more context (optional)"></textarea>
        </app-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <app-field label="Assign to" for="tf-who" required [error]="show('assignee')" [hint]="assigneeHint()">
            <div class="flex gap-2">
              <select id="tf-who" class="input" name="who" [ngModel]="assignee()" (ngModelChange)="assignee.set($event); touch('assignee')" [disabled]="readOnly()">
                <option value="">Choose a person…</option>
                @for (m of tasks.team(); track m.id) {
                  <option [value]="m.id">{{ m.full_name || m.username }}{{ m.id === me() ? ' (me)' : '' }}</option>
                }
              </select>
              @if (assignee() !== me() && !readOnly()) {
                <button type="button" class="btn-ghost shrink-0 px-3! text-xs" (click)="assignee.set(me()); touch('assignee')" title="Assign to me">Me</button>
              }
            </div>
          </app-field>

          <app-field label="Category" for="tf-cat" optional hint="Helps the team filter and plan work.">
            <select id="tf-cat" class="input" name="cat" [ngModel]="category()" (ngModelChange)="category.set($event)" [disabled]="readOnly()">
              <option value="">No category</option>
              @for (c of tasks.categories(); track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </app-field>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <app-field label="Due date" for="tf-date" optional [error]="show('date')" hint="Leave empty if there's no deadline.">
            <div class="flex gap-2">
              <input id="tf-date" type="date" class="input" name="date" [ngModel]="date()" (ngModelChange)="date.set($event); touch('date')" [min]="isNew() ? todayStr : null" [disabled]="readOnly()" />
              @if (!readOnly()) {
                <div class="flex shrink-0 gap-1">
                  <button type="button" class="btn-ghost px-2.5! text-xs" (click)="quickDate(0)">Today</button>
                  <button type="button" class="btn-ghost hidden px-2.5! text-xs sm:inline-flex" (click)="quickDate(1)">Tmrw</button>
                </div>
              }
            </div>
          </app-field>
          <app-field label="Time" for="tf-time" optional [error]="show('time')" hint="Optional — for appointments or pickups.">
            <input id="tf-time" type="time" class="input" name="time" [ngModel]="time()" (ngModelChange)="time.set($event); touch('time')" [disabled]="readOnly()" />
          </app-field>
        </div>

        <app-field label="Priority" required>
          <div class="seg grid grid-cols-4 gap-1 rounded-xl border border-transparent bg-slate-100 p-1">
            @for (p of priorities; track p.v) {
              <button type="button" class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition"
                      [class]="priority() === p.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                      (click)="priority.set(p.v)" [disabled]="readOnly()">
                <span class="size-2 rounded-full {{ p.dot }}"></span>{{ p.l }}
              </button>
            }
          </div>
        </app-field>

        @if (task()) {
          <app-field label="Status" required>
            <div class="seg grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              @for (s of statuses; track s.v) {
                <button type="button" class="rounded-lg py-1.5 text-xs font-semibold transition"
                        [class]="status() === s.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                        (click)="status.set(s.v)" [disabled]="readOnly()">{{ s.l }}</button>
              }
            </div>
          </app-field>
        }

        @if (tasks.scope()) {
          <app-field label="Patient token" for="tf-token" optional [error]="show('token')" hint="Link a patient visit, e.g. SRS-1018-004.">
            <input id="tf-token" class="input font-mono uppercase" name="token" [ngModel]="token()" (ngModelChange)="token.set($event.toUpperCase())"
                   (blur)="touch('token')" autocomplete="off" maxlength="14" placeholder="ABC-0000-000" [disabled]="readOnly()" />
          </app-field>
        }

        @if (submitted() && errorCount()) {
          <div class="animate-fade-in flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            <lucide-icon name="triangle-alert" class="size-4 shrink-0" /> Please fix {{ errorCount() }} {{ errorCount() === 1 ? 'field' : 'fields' }} highlighted above.
          </div>
        }

        <div class="flex items-center gap-2 border-t border-slate-100 pt-4">
          @if (task() && tasks.canDelete(task()!)) {
            <button type="button" class="btn-danger px-3!" (click)="remove()" [disabled]="saving()" title="Delete task"><lucide-icon name="trash-2" class="size-4" /></button>
          }
          <button type="button" class="btn-ghost ml-auto" (click)="closed.emit()">{{ readOnly() ? 'Close' : 'Cancel' }}</button>
          @if (!readOnly()) {
            <button type="submit" class="btn-primary" [disabled]="saving()">
              <lucide-icon [name]="saving() ? 'loader-circle' : (task() ? 'save' : 'plus')" class="size-4" [class.animate-spin]="saving()" />
              {{ task() ? 'Save changes' : 'Create task' }}
            </button>
          }
        </div>
      </form>
    </app-modal>
  `,
})
export class TaskForm implements OnInit {
  readonly task = input<Task | null>(null);
  readonly closed = output<void>();
  protected readonly tasks = inject(TaskService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly priorities = PRIORITIES;
  protected readonly statuses = STATUSES;
  protected readonly titleMax = TITLE_MAX;
  protected readonly descMax = DESC_MAX;
  protected readonly todayStr = toDateInput(new Date());

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly assignee = signal('');
  protected readonly category = signal('');
  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly priority = signal<TaskPriority>('normal');
  protected readonly status = signal<TaskStatus>('todo');
  protected readonly token = signal('');

  protected readonly touched = signal<Partial<Record<Field, boolean>>>({});
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);

  protected readonly me = computed(() => this.auth.profile()?.id ?? '');
  protected readonly isNew = computed(() => !this.task());
  protected readonly readOnly = computed(() => !!this.task() && !this.tasks.canEdit(this.task()!));
  protected readonly assigneeHint = computed(() => {
    const m = this.tasks.member(this.assignee());
    if (!m) return 'Who is responsible for getting it done.';
    return m.id === this.me() ? 'Assigned to you.' : `${m.full_name || m.username} will see it in “My tasks”.`;
  });

  /** Every rule, with a message that says what's wrong and how to fix it. */
  protected readonly errors = computed<Partial<Record<Field, string>>>(() => {
    const e: Partial<Record<Field, string>> = {};
    const title = this.title().trim();
    if (!title) e.title = 'Title is required — describe the job in a few words.';
    else if (title.length < 3) e.title = 'Too short — use at least 3 characters so your team understands it.';
    else if (title.length > TITLE_MAX) e.title = `Too long by ${title.length - TITLE_MAX} characters — keep the title short and move details below.`;

    const desc = this.description();
    if (desc.length > DESC_MAX) e.description = `Details can be up to 1,000 characters — remove ${desc.length - DESC_MAX} to save.`;

    if (!this.assignee()) e.assignee = 'Choose who will do this task — pick “Me” if it’s yours.';
    else if (!this.tasks.member(this.assignee())) e.assignee = 'That person is no longer on this team — choose someone else.';

    const d = this.date();
    const tm = this.time();
    if (d) {
      const day = new Date(`${d}T00:00`);
      if (isNaN(day.getTime())) e.date = 'That isn’t a real date — use the calendar picker.';
      else if (this.isNew() && d < this.todayStr) e.date = 'That date has already passed — pick today or a later date.';
      else if (day.getTime() - Date.now() > 2 * 365 * 86_400_000) e.date = 'That’s more than 2 years away — check the year.';
      else if (tm && this.isNew() && d === this.todayStr && tm < toTimeInput(new Date())) e.time = 'That time has already passed today — pick a later time.';
    } else if (tm) {
      e.time = 'Add a due date for this time, or clear the time.';
    }

    const tok = this.token().trim();
    if (tok && !/^[A-Z]{1,5}-\d{4}-\d{3,4}$/.test(tok)) e.token = 'Tokens look like SRS-1018-004 — copy it from the patient’s receipt.';
    return e;
  });
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);

  ngOnInit() {
    const t = this.task();
    if (!t) {
      this.assignee.set(this.me());
      return;
    }
    this.title.set(t.title);
    this.description.set(t.description ?? '');
    this.assignee.set(t.assignee_id);
    this.category.set(t.category ?? '');
    this.priority.set(t.priority);
    this.status.set(t.status);
    this.token.set(t.visit_token ?? '');
    if (t.due_at) {
      const d = new Date(t.due_at);
      this.date.set(toDateInput(d));
      if (t.has_time) this.time.set(toTimeInput(d));
    }
  }

  /** Error to display for a field: only after the user has touched it, or tried to save. */
  show(f: Field): string | null {
    return this.submitted() || this.touched()[f] ? (this.errors()[f] ?? null) : null;
  }

  touch(f: Field) {
    this.touched.update((t) => ({ ...t, [f]: true }));
  }

  quickDate(offset: number) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    this.date.set(toDateInput(d));
    this.touch('date');
  }

  async save() {
    this.submitted.set(true);
    if (this.errorCount()) {
      this.toast.warn(this.errorCount() === 1 ? 'One field needs attention.' : `${this.errorCount()} fields need attention.`);
      return;
    }
    const d = this.date();
    const tm = this.time();
    const payload: TaskInput = {
      title: this.title().trim(),
      description: this.description().trim() || null,
      assignee_id: this.assignee(),
      category: this.category() || null,
      priority: this.priority(),
      status: this.status(),
      due_at: d ? new Date(`${d}T${tm || '00:00'}`).toISOString() : null,
      has_time: !!(d && tm),
      visit_token: this.token().trim() || null,
    };
    this.saving.set(true);
    try {
      if (this.task()) await this.tasks.update(this.task()!.id, payload);
      else await this.tasks.create(payload);
      this.toast.success(this.task() ? 'Task updated.' : 'Task created.');
      this.closed.emit();
    } catch (e) {
      this.toast.fail(e, 'Could not save the task.');
    } finally {
      this.saving.set(false);
    }
  }

  async remove() {
    const t = this.task();
    if (!t || !confirm(`Delete “${t.title}”?`)) return;
    this.saving.set(true);
    try {
      await this.tasks.remove(t);
      this.toast.success('Task deleted.');
      this.closed.emit();
    } catch (e) {
      this.toast.fail(e, 'Could not delete the task.');
    } finally {
      this.saving.set(false);
    }
  }
}
