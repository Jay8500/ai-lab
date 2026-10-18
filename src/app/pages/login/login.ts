import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { Profile } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { describeDevice, SessionService } from '../../core/session.service';
import { ActivityService } from '../../core/activity.service';
import { TabLockService } from '../../core/tab-lock.service';

type Mode = 'login' | 'forgot' | 'reset';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './login.html',
})
export class LoginPage implements OnInit {
  protected readonly tenant = inject(TenantService);
  private readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly sessions = inject(SessionService);
  private readonly activity = inject(ActivityService);
  private readonly tabs = inject(TabLockService);
  /** busy = the workspace is already open in another tab; moved = another tab took it over */
  protected readonly tabNotice = signal<'busy' | 'moved' | null>(null);
  protected readonly brand = environment.brand;

  protected email = this.auth.lastEmail;
  protected password = '';
  protected remember = this.auth.rememberMe;
  protected readonly showPw = signal(false);
  protected readonly busy = signal(false);
  protected readonly mode = signal<Mode>('login');
  /** Signed in, but the account is already active on other devices — waiting for the user's choice. */
  protected readonly pending = signal<{ profile: Profile; devices: string[] } | null>(null);
  /** This browser was signed out because the account was used / removed elsewhere. */
  protected readonly kickedNotice = signal(false);

  /** Set when the account belongs to a different site (admin console or another lab). */
  protected readonly elsewhere = signal<{ label: string; url: string; host: string } | null>(null);

  protected readonly t = computed(() => this.tenant.tenant());
  protected readonly title = computed(() =>
    this.mode() === 'forgot' ? 'Reset your password' : this.mode() === 'reset' ? 'Choose a new password'
      : this.t()?.pages?.login_title || (this.t() ? 'Staff sign in' : 'Admin sign in'),
  );
  protected readonly subtitle = computed(() =>
    this.t()?.pages?.login_subtitle ||
    (this.t() ? `Sign in to the ${this.t()!.name} workspace` : `${this.brand.name} ${this.brand.product} console — authorised team only`),
  );

  async ngOnInit() {
    if (this.sessions.consumeKickedNotice()) this.kickedNotice.set(true);
    if (this.route.snapshot.queryParamMap.get('reset')) {
      this.mode.set('reset');
      return;
    }
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'busy' || tab === 'moved') {
      // Same session as the other tab — don't sign out, just don't open the workspace here
      if (this.auth.profile()) return this.tabNotice.set(tab);
    }
    const p = this.auth.profile();
    if (p) await this.routeFor(p).catch((e) => this.toast.fail(e));
  }

  /** Move the workspace to this tab; the other tab goes to the login page. */
  async useThisTab() {
    this.tabs.takeOver();
    this.tabNotice.set(null);
    const p = this.auth.profile();
    if (p) await this.routeFor(p).catch((e) => this.toast.fail(e));
  }

  async submit() {
    this.elsewhere.set(null);
    const email = this.email.trim();
    if (this.mode() !== 'reset') {
      if (!email) return this.toast.warn(this.mode() === 'forgot' ? 'Enter your email.' : 'Enter your username or email.');
      const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      if (this.mode() === 'forgot' && !isEmail) return this.toast.warn('Enter the email on your account.');
      if (email.includes('@') && !isEmail) return this.toast.warn('Enter a valid email address.');
    }
    if (this.mode() === 'login' && !this.password) {
      this.toast.warn('Enter your password.');
      return;
    }
    if (this.mode() === 'reset' && this.password.length < 8) {
      this.toast.warn('Password must be at least 8 characters.');
      return;
    }
    this.busy.set(true);
    try {
      if (this.mode() === 'forgot') {
        await this.auth.sendReset(email);
        this.toast.success('Reset link sent, if that email has an account.');
        this.mode.set('login');
      } else if (this.mode() === 'reset') {
        await this.auth.updatePassword(this.password);
        this.toast.success('Password updated.');
        const p = this.auth.profile();
        if (p) await this.routeFor(p);
      } else {
        const p = await this.auth.signIn(this.email.trim(), this.password, this.remember, this.t()?.slug ?? null);
        this.kickedNotice.set(false);
        if (this.belongsHere(p)) this.activity.log('signed_in');
        if (this.belongsHere(p)) {
          const others = (await this.sessions.list()).filter((s) => !s.is_current);
          if (others.length) {
            this.pending.set({
              profile: p,
              devices: others.map((s) => {
                const d = describeDevice(s.user_agent);
                return `${d.browser} on ${d.os}`;
              }),
            });
            return;
          }
        }
        await this.routeFor(p);
      }
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private belongsHere(p: Profile): boolean {
    const platform = p.role === 'super_admin' || p.role === 'platform_admin';
    const lab = this.t();
    return lab ? !platform && p.tenant_id === lab.id : platform;
  }

  /** Keep this sign-in and sign the account out everywhere else. */
  async continueHere() {
    const pend = this.pending();
    if (!pend) return;
    this.busy.set(true);
    try {
      const n = await this.sessions.revokeOthers();
      this.pending.set(null);
      this.toast.success(`Signed out ${n} other device(s).`);
      await this.routeFor(pend.profile);
    } catch (e) {
      this.toast.fail(e, 'Could not sign out the other devices.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Don't take over — drop the sign-in that was just made here. */
  async cancelHere() {
    this.pending.set(null);
    this.password = '';
    await this.auth.signOut();
    this.toast.info('Sign-in cancelled. Your other device stays signed in.');
  }

  /**
   * Strict separation — an account only works where it belongs:
   *  admin address  → SpreadApps admins only
   *  lab subdomain  → that lab's admins and staff only
   * Anything else is signed out immediately.
   */
  private async routeFor(p: Profile) {
    const next = this.route.snapshot.queryParamMap.get('next');
    const lab = this.t();
    const isPlatform = p.role === 'super_admin' || p.role === 'platform_admin';

    if (!lab) {
      if (isPlatform) {
        await this.router.navigateByUrl(next?.startsWith('/admin') ? next : '/admin');
        return;
      }
      // A lab account on the admin address: refuse, but point them to their own lab
      const { data } = await this.sb.client.from('tenants').select('slug, name').eq('id', p.tenant_id ?? '').maybeSingle();
      await this.auth.signOut();
      if (data?.slug) {
        this.elsewhere.set({ label: `${data.name} workspace`, url: this.tenant.labUrl(data.slug, '/login'), host: new URL(this.tenant.labUrl(data.slug, '/login')).host });
        return;
      }
      throw new Error('This sign-in is for SpreadApps admins only.');
    }

    if (!isPlatform && p.tenant_id === lab.id) {
      await this.router.navigateByUrl(next?.startsWith('/lab') ? next : '/lab');
      return;
    }

    if (isPlatform) {
      await this.sendElsewhere('SpreadApps admin console', this.tenant.platformUrl('/login'));
      return;
    }
    await this.auth.signOut();
    throw new Error(`This account doesn't belong to ${lab.name}.`);
  }

  private async sendElsewhere(label: string, url: string) {
    await this.auth.signOut();
    this.password = '';
    this.elsewhere.set({ label, url, host: new URL(url).host });
  }
}
