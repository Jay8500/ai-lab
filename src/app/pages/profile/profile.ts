import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { realEmail } from '../../core/models';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../shared/avatar';

/** "My profile" — used inside both the admin console and the lab workspace. */
@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink, LucideAngularModule, DatePipe, Avatar],
  template: `
    @if (auth.profile(); as p) {
      <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">My profile</h1>
      <p class="text-sm text-slate-500">Your photo and name are shown to your team.</p>

      <div class="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <form class="card space-y-5 p-5 sm:p-6" (ngSubmit)="save()">
          <div class="flex flex-wrap items-center gap-5">
            <app-avatar [name]="name || p.username" [url]="photo()" [size]="88" />
            <div class="flex flex-wrap gap-2">
              <label class="btn-ghost cursor-pointer py-2! text-xs">
                <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" (change)="pick($event)" />
                <lucide-icon [name]="uploading() ? 'loader-circle' : 'image'" class="size-3.5" [class.animate-spin]="uploading()" />
                {{ photo() ? 'Change photo' : 'Upload photo' }}
              </label>
              @if (photo()) {
                <button type="button" class="btn-ghost py-2! text-xs hover:text-rose-600!" (click)="photo.set(null)">
                  <lucide-icon name="trash-2" class="size-3.5" /> Remove
                </button>
              }
              <p class="w-full text-xs text-slate-400">PNG, JPG or WebP, up to 2 MB. Without a photo your initials are shown.</p>
            </div>
          </div>

          <div>
            <label class="label" for="pf-name">Full name</label>
            <input id="pf-name" class="input" name="name" [(ngModel)]="name" maxlength="80" />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <span class="label">Username</span>
              <p class="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-700">
                <lucide-icon name="lock" class="size-3.5 text-slate-400" /> {{ p.username || '—' }}
              </p>
            </div>
            <div>
              <span class="label">Email</span>
              <p class="truncate rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">{{ email() || 'Not set — you sign in with your username' }}</p>
            </div>
            <div>
              <span class="label">Role</span>
              <p class="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">{{ auth.roleLabel() }}</p>
            </div>
            <div>
              <span class="label">{{ tenant.tenant() ? 'Lab' : 'Workspace' }}</span>
              <p class="truncate rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">{{ tenant.name() }}</p>
            </div>
          </div>
          <p class="text-xs text-slate-400">Username, email and role are managed by your admin. Member since {{ p.created_at | date: 'MMM d, y' }}.</p>

          <button class="btn-primary" type="submit" [disabled]="saving()">
            <lucide-icon [name]="saving() ? 'loader-circle' : 'save'" class="size-4" [class.animate-spin]="saving()" /> Save profile
          </button>
        </form>

        <form class="card h-fit space-y-3 p-5 sm:p-6" (ngSubmit)="changePassword()">
          <h2 class="section-title">Change password</h2>
          <div>
            <label class="label" for="pf-pw">New password</label>
            <input id="pf-pw" class="input" type="password" name="pw" [(ngModel)]="pw" autocomplete="new-password" placeholder="At least 8 characters" />
          </div>
          <div>
            <label class="label" for="pf-pw2">Confirm new password</label>
            <input id="pf-pw2" class="input" type="password" name="pw2" [(ngModel)]="pw2" autocomplete="new-password" />
          </div>
          <button class="btn-ghost w-full" type="submit" [disabled]="savingPw()">
            <lucide-icon name="key-round" class="size-4" /> Update password
          </button>
          <a routerLink="../security" class="mt-2 flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm transition hover:bg-slate-50">
            <span class="grid size-9 place-items-center rounded-lg bg-rose-50 text-rose-600"><lucide-icon name="shield-check" class="size-4" /></span>
            <span class="flex-1"><b class="block text-slate-700">Account security</b><span class="text-xs text-slate-400">Devices signed in to your account</span></span>
            <lucide-icon name="chevron-right" class="size-4 text-slate-400" />
          </a>
        </form>
      </div>
    }
  `,
})
export class ProfilePage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);

  protected name = '';
  protected pw = '';
  protected pw2 = '';
  protected readonly photo = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly saving = signal(false);
  protected readonly savingPw = signal(false);

  protected email() {
    return realEmail(this.auth.profile()?.email);
  }

  ngOnInit() {
    const p = this.auth.profile();
    this.name = p?.full_name ?? '';
    this.photo.set(p?.avatar_url ?? null);
  }

  async pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return this.toast.warn('Choose a PNG, JPG or WebP image.');
    if (f.size > 2 * 1024 * 1024) return this.toast.warn('Photo must be under 2 MB.');
    this.uploading.set(true);
    try {
      this.photo.set(await this.auth.uploadAvatar(f));
      this.toast.info('Photo ready — click Save profile.');
    } catch (err) {
      this.toast.fail(err, 'Could not upload the photo.');
    } finally {
      this.uploading.set(false);
    }
  }

  async save() {
    if (!this.name.trim()) return this.toast.warn('Enter your name.');
    this.saving.set(true);
    try {
      await this.auth.updateProfile(this.name, this.photo());
      this.toast.success('Profile saved.');
    } catch (e) {
      this.toast.fail(e, 'Could not save your profile.');
    } finally {
      this.saving.set(false);
    }
  }

  async changePassword() {
    if (this.pw.length < 8) return this.toast.warn('Password must be at least 8 characters.');
    if (this.pw !== this.pw2) return this.toast.warn('The two passwords do not match.');
    this.savingPw.set(true);
    try {
      await this.auth.updatePassword(this.pw);
      this.pw = this.pw2 = '';
      this.toast.success('Password updated.');
    } catch (e) {
      this.toast.fail(e, 'Could not update the password.');
    } finally {
      this.savingPw.set(false);
    }
  }
}
