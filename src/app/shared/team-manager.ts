import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService, NewUser, UserScope } from '../core/admin.service';
import { AuthService } from '../core/auth.service';
import { Profile, realEmail, Role, ROLE_LABELS, STAFF_TITLES } from '../core/models';
import { ToastService } from '../core/toast.service';
import { Avatar } from './avatar';

/**
 * List + create + edit logins for one scope:
 *   scope "platform" → SpreadApps admins (super admin only)
 *   scope "lab"      → one lab's admins and staff
 * The admin-users edge function enforces who may do what.
 */
@Component({
  selector: 'app-team-manager',
  imports: [FormsModule, LucideAngularModule, DatePipe, Avatar],
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
                <p class="truncate text-xs text-slate-400"><span class="font-mono text-slate-500">{{ u.username }}</span> · {{ email(u) || 'username sign-in only' }} · since {{ u.created_at | date: 'MMM d, y' }}</p>
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

      <form class="card space-y-3 p-5 sm:p-6" (ngSubmit)="create()">
        <h3 class="section-title">Create login</h3>
        <div><label class="label">Name</label><input class="input" name="n" [(ngModel)]="form.full_name" /></div>
        <div>
          <label class="label">Username <span class="font-normal text-slate-400">(optional)</span></label>
          <input class="input font-mono" name="un" [(ngModel)]="form.username" autocomplete="off" autocapitalize="none" maxlength="31"
                 [placeholder]="'auto, e.g. ' + (scope() === 'platform' ? 'sa' : 'lab') + '.' + ((form.full_name.split(' ')[0] || 'name').toLowerCase())" />
        </div>
        <div>
          <label class="label">Email <span class="font-normal text-slate-400">(optional)</span></label>
          <input class="input" name="e" type="email" [(ngModel)]="form.email" autocomplete="off" placeholder="Leave empty for username-only sign-in" />
        </div>
        <div>
          <label class="label">Password</label>
          <div class="flex gap-2">
            <input class="input font-mono" name="p" [(ngModel)]="form.password" required minlength="8" autocomplete="new-password" />
            <button type="button" class="btn-ghost px-3!" (click)="generate()" title="Generate"><lucide-icon name="refresh-cw" class="size-4" /></button>
          </div>
        </div>
        @if (roles().length > 1) {
          <div>
            <label class="label">Role</label>
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

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly titles = STAFF_TITLES;
  protected readonly users = signal<Profile[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly me = computed(() => this.auth.profile()?.id);
  protected readonly roles = computed<Role[]>(() => (this.scope() === 'platform' ? ['platform_admin'] : ['lab_owner', 'lab_staff']));
  protected form: NewUser = this.blank();

  constructor() {
    effect(() => {
      this.scope();
      this.tenantId();
      this.form = this.blank();
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

  generate() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const arr = crypto.getRandomValues(new Uint32Array(10));
    this.form.password = Array.from(arr, (n) => chars[n % chars.length]).join('') + '@1';
  }

  async create() {
    const em = this.form.email.trim();
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return this.toast.warn('Enter a valid email address, or leave it empty.');
    if (!em && !this.form.full_name.trim() && !(this.form.username ?? '').trim()) return this.toast.warn('Enter a name, so a username can be created.');
    if (this.form.password.length < 8) return this.toast.warn('Password must be at least 8 characters.');
    const un = (this.form.username ?? '').trim().toLowerCase();
    if (un && !/^[a-z0-9][a-z0-9._-]{2,30}$/.test(un)) return this.toast.warn('Username: 3–31 letters, numbers, dot, dash or underscore.');
    this.form.username = un || null;
    this.busy.set(true);
    try {
      await this.admin.createUser(this.tenantId(), this.form, this.scope());
      this.toast.success('Login created.');
      this.form = this.blank();
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
    const pw = prompt(`New password for ${u.username} (8+ characters)`);
    if (!pw) return;
    if (pw.length < 8) return this.toast.warn('Password must be at least 8 characters.');
    try {
      await this.admin.resetPassword(this.tenantId(), u.id, pw, this.scope());
      this.toast.success('Password updated');
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async signOutAll(u: Profile) {
    if (!confirm(`Sign ${u.full_name || u.username} out of every device?`)) return;
    try {
      await this.admin.signOutEverywhere(this.tenantId(), u.id, this.scope());
      this.toast.success('Signed out of all devices.');
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async remove(u: Profile) {
    if (!confirm(`Remove the login for ${u.username}? They will no longer be able to sign in.`)) return;
    try {
      await this.admin.removeUser(this.tenantId(), u.id, this.scope());
      this.users.update((l) => l.filter((x) => x.id !== u.id));
      this.toast.success('Login removed');
    } catch (e) {
      this.toast.fail(e);
    }
  }
}
