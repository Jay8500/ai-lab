import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { describeDevice, DeviceSession, SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';

/** Where am I signed in? — list and remove device sessions. */
@Component({
  selector: 'app-security',
  imports: [LucideAngularModule, DatePipe],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Account security</h1>
        <p class="text-sm text-slate-500">Devices signed in to your account. Remove any you don't recognise.</p>
      </div>
      <button class="btn-ghost" (click)="load()" [disabled]="loading()">
        <lucide-icon name="refresh-cw" class="size-4" [class.animate-spin]="loading()" /> Refresh
      </button>
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
      <div class="card divide-y divide-slate-100">
        @for (s of sessions(); track s.id) {
          @let d = device(s);
          <div class="flex flex-wrap items-center gap-4 p-4 sm:px-5">
            <span class="grid size-11 shrink-0 place-items-center rounded-xl"
                  [class]="s.is_current ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'">
              <lucide-icon [name]="d.mobile ? 'smartphone' : 'monitor'" class="size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                {{ d.browser }} on {{ d.os }}
                @if (s.is_current) {
                  <span class="pill border-emerald-100 bg-emerald-50 text-emerald-600">This device</span>
                }
              </p>
              <p class="mt-0.5 text-xs text-slate-500">
                {{ s.ip || 'Unknown IP' }} · Signed in {{ s.created_at | date: 'MMM d, h:mm a' }}
              </p>
              <p class="text-xs text-slate-400">Last active {{ ago(s.last_active) }}</p>
            </div>
            @if (!s.is_current) {
              <button class="btn-danger !py-2 text-xs" (click)="remove(s)" [disabled]="busy() === s.id">
                <lucide-icon [name]="busy() === s.id ? 'loader-circle' : 'log-out'" class="size-3.5" [class.animate-spin]="busy() === s.id" /> Remove
              </button>
            }
          </div>
        } @empty {
          <p class="p-8 text-center text-sm text-slate-400">{{ loading() ? 'Loading…' : 'No active sessions found.' }}</p>
        }
      </div>

      <div class="space-y-4">
        <div class="card p-5">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-600"><lucide-icon name="shield-check" class="size-5" /></span>
            <div>
              <h2 class="section-title">Sign out other devices</h2>
              <p class="text-xs text-slate-400">{{ others() }} other device(s) signed in</p>
            </div>
          </div>
          <p class="mt-3 text-xs text-slate-500">They are signed out within seconds. You stay signed in here.</p>
          <button class="btn-danger mt-4 w-full" (click)="removeOthers()" [disabled]="busy() === 'all'">
            <lucide-icon [name]="busy() === 'all' ? 'loader-circle' : 'log-out'" class="size-4" [class.animate-spin]="busy() === 'all'" /> Sign out all other devices
          </button>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-white p-5 text-xs leading-relaxed text-slate-500">
          <p class="flex items-center gap-2 text-sm font-semibold text-slate-700"><lucide-icon name="lock" class="size-4 text-brand" /> How your account is protected</p>
          <ul class="mt-2 list-disc space-y-1 pl-4">
            <li>Everything between this app and the server is encrypted (HTTPS/TLS).</li>
            <li>Data and files are encrypted at rest on the server.</li>
            <li>Signing in on a new device asks before signing out the others.</li>
            <li>A removed device is signed out immediately.</li>
          </ul>
        </div>
      </div>
    </div>
  `,
})
export class SecurityPage implements OnInit {
  private readonly sessionsSvc = inject(SessionService);
  private readonly toast = inject(ToastService);

  protected readonly sessions = signal<DeviceSession[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly others = computed(() => this.sessions().filter((s) => !s.is_current).length);

  ngOnInit() {
    this.load();
  }

  device(s: DeviceSession) {
    return describeDevice(s.user_agent);
  }

  ago(iso: string) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h} h ago`;
    return `${Math.round(h / 24)} d ago`;
  }

  async load() {
    this.loading.set(true);
    try {
      this.sessions.set(await this.sessionsSvc.list());
    } catch (e) {
      this.toast.fail(e, 'Could not load your devices.');
    } finally {
      this.loading.set(false);
    }
  }

  async remove(s: DeviceSession) {
    const d = describeDevice(s.user_agent);
    if (!confirm(`Sign out ${d.browser} on ${d.os}?`)) return;
    this.busy.set(s.id);
    try {
      await this.sessionsSvc.revoke(s.id);
      this.sessions.update((l) => l.filter((x) => x.id !== s.id));
      this.toast.success('Device signed out.');
    } catch (e) {
      this.toast.fail(e, 'Could not sign out that device.');
    } finally {
      this.busy.set(null);
    }
  }

  async removeOthers() {
    if (!this.others()) return this.toast.info('No other devices are signed in.');
    if (!confirm(`Sign out ${this.others()} other device(s)?`)) return;
    this.busy.set('all');
    try {
      const n = await this.sessionsSvc.revokeOthers();
      this.sessions.update((l) => l.filter((x) => x.is_current));
      this.toast.success(`${n} device(s) signed out.`);
    } catch (e) {
      this.toast.fail(e, 'Could not sign out other devices.');
    } finally {
      this.busy.set(null);
    }
  }
}
