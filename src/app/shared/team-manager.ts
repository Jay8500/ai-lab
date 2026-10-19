import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService, NewUser, UserScope } from '../core/admin.service';

type LoginField = 'name' | 'email' | 'password';

interface UsernameStatus {
  state: 'auto' | 'checking' | 'ok' | 'taken' | 'invalid';
  username?: string;
  suggestion?: string | null;
}
import { AuthService } from '../core/auth.service';
import { Profile, realEmail, Role, ROLE_LABELS, STAFF_TITLES } from '../core/models';
import { ToastService } from '../core/toast.service';
import { Avatar } from './avatar';
import { FormField } from './form-field';
import { DialogService } from '../core/dialog.service';

/**
 * List + create + edit logins for one scope:
 *   scope "platform" → Spread Apps admins (super admin only)
 *   scope "lab"      → one lab's admins and staff
 * The admin-users edge function enforces who may do what.
 */
@Component({
  selector: 'app-team-manager',
  imports: [FormsModule, LucideAngularModule, DatePipe, Avatar, FormField],
  template: `
    <div class="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div class="card p-5 sm:p-6">
        <div class="flex items-center justify-between">
          <h3 class="section-title">{{ heading() }}</h3>
          <span class="text-xs text-slate-400">{{ users().length }} login(s)</span>
        </div>
        <ul class="mt-3 divide-y divide-slate-100">
          @for (u of users(); track u.id) {
            <li class="flex flex-wrap items-center gap-3 py-3">
              <app-avatar [name]="u.full_name || u.username" [url]="u.avatar_url" [size]="36" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-700">
                  {{ u.full_name || u.username }} @if (u.id === me()) { <span class="text-xs font-normal text-slate-400">(you)</span> }
                </p>
                <p class="truncate text-xs text-slate-400"><span class="font-mono text-slate-500">{{ u.username }}</span> ·
                  @if (email(u)) { {{ email(u) }} } @else {
                    <button type="button" class="pill border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" (click)="setEmail(u)"
                            title="Without an email they can’t reset their password or receive announcements">No email · Add</button>
                  }
                  · since {{ u.created_at | date: 'MMM d, y' }}</p>
              </div>
              @if (u.id === me() || u.role === 'super_admin') {
                <span class="pill border-slate-200 bg-slate-50 text-slate-500">{{ label(u) }}</span>
              } @else {
                <select class="input w-auto! py-1.5! text-xs" [ngModel]="u.role" (ngModelChange)="setRole(u, $event)">
                  @for (r of roles(); track r) { <option [value]="r">{{ roleLabels[r] }}</option> }
                </select>
                @if (u.role === 'lab_staff') {
                  <select class="input w-auto! py-1.5! text-xs" [ngModel]="u.title || ''" (ngModelChange)="setTitle(u, $event)">
                    <option value="">No title</option>
                    @for (t of titles; track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                }
                <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" (click)="setEmail(u)" [title]="email(u) ? 'Change email' : 'Add email'"><lucide-icon name="mail" class="size-4" /></button>
                <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" (click)="resetPw(u)" title="Set new password"><lucide-icon name="key-round" class="size-4" /></button>
                <button class="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" (click)="signOutAll(u)" title="Sign out of all devices"><lucide-icon name="log-out" class="size-4" /></button>
                <button class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="remove(u)" title="Remove login"><lucide-icon name="trash-2" class="size-4" /></button>
              }
            </li>
          } @empty {
            <li class="py-6 text-center text-sm text-slate-400">{{ loading() ? 'Loading…' : emptyText() }}</li>
          }
        </ul>
      </div>

      <form class="card space-y-3 p-5 sm:p-6" (ngSubmit)="create()" novalidate>
        <div>
          <h3 class="section-title">Create login</h3>
          <p class="text-xs text-slate-400">Fields marked <span class="text-rose-500">*</span> are required.</p>
        </div>
        <app-field label="Full name" for="tm-name" required [error]="show('name')" hint="Shown to the team; the username is built from it.">
          <input id="tm-name" class="input" name="n" [(ngModel)]="form.full_name" (ngModelChange)="queueCheck()" (blur)="touch('name')" maxlength="80" placeholder="e.g. Ravi Kumar" />
        </app-field>
        <div>
          <label class="label">Username <span class="font-normal text-slate-400">(optional — auto-created)</span></label>
          <div class="relative">
            <input class="input pr-10! font-mono" name="un" [(ngModel)]="form.username" (ngModelChange)="queueCheck()" autocomplete="off"
                   autocapitalize="none" spellcheck="false" maxlength="31"
                   [class]="{ 'border-emerald-300!': uname().state === 'ok', 'focus:ring-emerald-500/10!': uname().state === 'ok', 'border-rose-300!': uname().state === 'taken' || uname().state === 'invalid', 'focus:ring-rose-500/10!': uname().state === 'taken' || uname().state === 'invalid' }"
                   [placeholder]="uname().state === 'auto' && uname().suggestion ? uname().suggestion! : 'Leave empty to auto-create'" />
            <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
              @switch (uname().state) {
                @case ('checking') { <lucide-icon name="loader-circle" class="size-4 animate-spin text-slate-400" /> }
                @case ('ok') { <lucide-icon name="circle-check" class="size-4 text-emerald-500" /> }
                @case ('taken') { <lucide-icon name="circle-x" class="size-4 text-rose-500" /> }
                @case ('invalid') { <lucide-icon name="triangle-alert" class="size-4 text-amber-500" /> }
              }
            </span>
          </div>
          <p class="mt-1.5 min-h-4 text-xs">
            @switch (uname().state) {
              @case ('ok') { <span class="text-emerald-600"><b class="font-mono">{{ uname().username }}</b> is available</span> }
              @case ('taken') {
                <span class="text-rose-600"><b class="font-mono">{{ uname().username }}</b> is taken.</span>
                @if (uname().suggestion) {
                  <button type="button" class="ml-1 font-semibold text-brand hover:underline" (click)="useSuggestion()">Use {{ uname().suggestion }}</button>
                }
              }
              @case ('invalid') { <span class="text-amber-600">3–31 characters: lowercase letters, numbers, dot, dash or underscore.</span> }
              @case ('auto') {
                @if (uname().suggestion) { <span class="text-slate-500">Will be created as <b class="font-mono text-slate-700">{{ uname().suggestion }}</b></span> }
              }
            }
          </p>
        </div>
        <app-field label="Email" for="tm-email" optional [error]="show('email')" hint="Needed only for “Forgot password”. Leave empty for username-only sign-in.">
          <input id="tm-email" class="input" name="e" type="email" [(ngModel)]="form.email" (blur)="touch('email')" autocomplete="off" placeholder="name@example.com" />
        </app-field>
        <app-field label="Temporary password" for="tm-pw" required [error]="show('password')" hint="At least 8 characters with a letter and a number. Tap ↻ to generate one.">
          <div class="flex gap-2">
            <input id="tm-pw" class="input font-mono" name="p" [(ngModel)]="form.password" (blur)="touch('password')" autocomplete="new-password" />
            <button type="button" class="btn-ghost px-3!" (click)="generate(); touch('password')" title="Generate a strong password"><lucide-icon name="refresh-cw" class="size-4" /></button>
          </div>
        </app-field>
        @if (roles().length > 1) {
          <div>
            <label class="label">Role <span class="text-rose-500">*</span></label>
            <select class="input" name="r" [(ngModel)]="form.role">
              @for (r of roles(); track r) { <option [value]="r">{{ roleLabels[r] }}</option> }
            </select>
          </div>
        }
        @if (form.role === 'lab_staff') {
          <div>
            <label class="label">Job title</label>
            <select class="input" name="t" [(ngModel)]="form.title">
              <option [ngValue]="null">—</option>
              @for (t of titles; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </div>
        }
        <button class="btn-primary w-full" type="submit" [disabled]="busy()">
          <lucide-icon [name]="busy() ? 'loader-circle' : 'user-plus'" class="size-4" [class.animate-spin]="busy()" /> Create login
        </button>
        @if (signInHint()) {
          <p class="text-xs text-slate-400">They sign in at <span class="font-mono text-slate-600">{{ signInHint() }}</span>. Share the email and password with them privately.</p>
        }
      </form>
    </div>
  `,
})
export class TeamManager {
  readonly scope = input<UserScope>('lab');
  readonly tenantId = input<string | null>(null);
  readonly heading = input('Logins');
  readonly signInHint = input('');
  readonly emptyText = input('No logins yet.');

  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly titles = STAFF_TITLES;
  protected readonly users = signal<Profile[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly me = computed(() => this.auth.profile()?.id);
  protected readonly roles = computed<Role[]>(() => (this.scope() === 'platform' ? ['platform_admin'] : ['lab_owner', 'lab_staff']));
  protected form: NewUser = this.blank();
  /** Live username status under the Username field */
  protected readonly uname = signal<UsernameStatus>({ state: 'auto' });
  private checkTimer?: ReturnType<typeof setTimeout>;
  private checkSeq = 0;

  /** Debounced: re-check whenever the name or username changes. */
  queueCheck() {
    clearTimeout(this.checkTimer);
    const typed = (this.form.username ?? '').trim();
    if (typed) this.uname.set({ state: 'checking', username: typed.toLowerCase() });
    this.checkTimer = setTimeout(() => this.checkNow(), 350);
  }

  private async checkNow() {
    const seq = ++this.checkSeq;
    const typed = (this.form.username ?? '').trim().toLowerCase();
    const name = this.form.full_name.trim();
    if (!typed && !name) return this.uname.set({ state: 'auto' });
    try {
      const r = await this.admin.checkUsername(this.tenantId(), typed, name);
      if (seq !== this.checkSeq) return; // a newer keystroke won
      if (!typed) this.uname.set({ state: 'auto', suggestion: r.suggestion });
      else if (!r.valid) this.uname.set({ state: 'invalid', username: typed });
      else if (!r.available) this.uname.set({ state: 'taken', username: typed, suggestion: r.suggestion });
      else this.uname.set({ state: 'ok', username: typed });
    } catch {
      if (seq === this.checkSeq) this.uname.set({ state: 'auto' });
    }
  }

  useSuggestion() {
    const sug = this.uname().suggestion;
    if (!sug) return;
    this.form.username = sug;
    this.uname.set({ state: 'ok', username: sug });
  }

  constructor() {
    effect(() => {
      this.scope();
      this.tenantId();
      this.form = this.blank();
      this.uname.set({ state: 'auto' });
      this.load();
    });
  }

  email(u: Profile) {
    return realEmail(u.email);
  }

  label(u: Profile) {
    return u.role === 'lab_staff' && u.title ? u.title : ROLE_LABELS[u.role];
  }

  private blank(): NewUser {
    const roles = this.scope?.() === 'platform' ? ['platform_admin'] : ['lab_owner', 'lab_staff'];
    return { full_name: '', email: '', password: '', role: roles[0], title: null, username: null };
  }

  async load() {
    this.loading.set(true);
    try {
      this.users.set(await this.admin.users(this.tenantId(), this.scope()));
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.loading.set(false);
    }
  }

  private randomPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join('') + '@1';
  }

  generate() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const arr = crypto.getRandomValues(new Uint32Array(10));
    this.form.password = Array.from(arr, (n) => chars[n % chars.length]).join('') + '@1';
  }

  protected readonly touched = signal<Record<string, boolean>>({});
  protected readonly submitted = signal(false);

  /** Field rules with messages that explain the fix. */
  errors(): Partial<Record<LoginField, string>> {
    const e: Partial<Record<LoginField, string>> = {};
    const name = this.form.full_name.trim();
    if (!name) e.name = 'Full name is required — your team sees it, and the username is built from it.';
    else if (name.length < 2) e.name = 'Enter at least 2 letters.';
    const em = this.form.email.trim();
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) e.email = 'That email doesn’t look right — check for typos like a missing “@” or “.com”, or leave it empty.';
    const pw = this.form.password;
    if (!pw) e.password = 'Set a temporary password — or tap ↻ to generate a strong one.';
    else if (pw.length < 8) e.password = `Too short — add ${8 - pw.length} more character${8 - pw.length === 1 ? '' : 's'} (minimum 8).`;
    else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) e.password = 'Use both letters and at least one number.';
    return e;
  }

  show(f: LoginField): string | null {
    return this.submitted() || this.touched()[f] ? (this.errors()[f] ?? null) : null;
  }

  touch(f: LoginField) {
    this.touched.update((t) => ({ ...t, [f]: true }));
  }

  async create() {
    this.submitted.set(true);
    if (this.uname().state === 'checking') return this.toast.info('Checking the username…');
    if (this.uname().state === 'taken') return this.toast.warn('That username is taken — pick another.');
    if (this.uname().state === 'invalid') return this.toast.warn('Fix the username format first.');
    const count = Object.keys(this.errors()).length;
    if (count) return this.toast.warn(count === 1 ? 'One field needs attention.' : `${count} fields need attention.`);
    const un = (this.form.username ?? '').trim().toLowerCase();
    if (un && !/^[a-z0-9][a-z0-9._-]{2,30}$/.test(un)) return this.toast.warn('Username: 3–31 letters, numbers, dot, dash or underscore.');
    this.form.username = un || null;
    this.busy.set(true);
    try {
      await this.admin.createUser(this.tenantId(), this.form, this.scope());
      this.toast.success('Login created.');
      this.submitted.set(false);
      this.touched.set({});
      this.form = this.blank();
      this.uname.set({ state: 'auto' });
      await this.load();
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  async setRole(u: Profile, role: Role) {
    await this.patch(u, { role }, `${u.full_name || u.username} is now ${ROLE_LABELS[role]}`);
  }

  async setTitle(u: Profile, title: string) {
    await this.patch(u, { title: title || null }, 'Title updated');
  }

  private async patch(u: Profile, p: Partial<NewUser>, msg: string) {
    try {
      await this.admin.updateUser(this.tenantId(), u.id, p, this.scope());
      this.toast.success(msg);
    } catch (e) {
      this.toast.fail(e);
    }
    await this.load();
  }

  async resetPw(u: Profile) {
    const pw = await this.dialog.prompt({
      title: `New password for ${u.full_name || u.username}`,
      message: 'Share it with them privately. They can change it later from My profile.',
      label: 'New password',
      value: this.randomPassword(),
      mono: true,
      hint: 'A strong password is suggested — you can type your own.',
      validate: (v) => (v.length < 8 ? 'At least 8 characters.' : !/[A-Za-z]/.test(v) || !/\d/.test(v) ? 'Use letters and at least one number.' : null),
      confirmText: 'Set password',
      icon: 'key-round',
    });
    if (!pw) return;
    try {
      await this.admin.resetPassword(this.tenantId(), u.id, pw, this.scope());
      this.toast.success('Password updated');
    } catch (e) {
      this.toast.fail(e);
    }
  }

  /** Add or change a login's email (needed for password reset and announcements). */
  async setEmail(u: Profile) {
    const current = this.email(u);
    const input = await this.dialog.prompt({
      title: `${current ? 'Change' : 'Add'} email for ${u.full_name || u.username}`,
      message: 'Needed for “Forgot password” and Spread Apps announcements. They can also sign in with it.',
      label: 'Email address',
      type: 'email',
      value: current,
      placeholder: 'name@example.com',
      validate: (v) => (!v ? 'Enter an email address.' : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'That email doesn’t look right — e.g. name@example.com.'),
      confirmText: 'Save email',
      icon: 'mail',
    });
    if (input === null) return;
    const value = input.replace(/\s+/g, '').toLowerCase();
    if (value === current) return;
    try {
      await this.admin.updateUser(this.tenantId(), u.id, { email: value }, this.scope());
      this.toast.success('Email saved.');
      await this.load();
    } catch (e) {
      this.toast.fail(e, 'Could not save the email.');
    }
  }

  async signOutAll(u: Profile) {
    const ok = await this.dialog.confirm({
      title: `Sign ${u.full_name || u.username} out everywhere?`,
      message: 'All their devices are signed out within seconds. Their login stays active — they can sign in again with their password.',
      confirmText: 'Sign out everywhere',
      tone: 'warning',
      icon: 'log-out',
    });
    if (!ok) return;
    try {
      await this.admin.signOutEverywhere(this.tenantId(), u.id, this.scope());
      this.toast.success('Signed out of all devices.');
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async remove(u: Profile) {
    const ok = await this.dialog.confirm({
      title: `Remove ${u.full_name || u.username}?`,
      message: `The login ${u.username} will be deleted and they won’t be able to sign in. Tasks assigned to them are removed too.`,
      confirmText: 'Remove login',
      tone: 'danger',
      icon: 'trash-2',
    });
    if (!ok) return;
    try {
      await this.admin.removeUser(this.tenantId(), u.id, this.scope());
      this.users.update((l) => l.filter((x) => x.id !== u.id));
      this.toast.success('Login removed');
    } catch (e) {
      this.toast.fail(e);
    }
  }
}
