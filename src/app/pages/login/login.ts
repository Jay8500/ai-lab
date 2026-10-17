import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { Profile } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { BrandMark } from '../../shared/brand-mark';

type Mode = 'login' | 'forgot' | 'reset';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, LucideAngularModule, BrandMark],
  templateUrl: './login.html',
})
export class LoginPage implements OnInit {
  protected readonly tenant = inject(TenantService);
  private readonly auth = inject(AuthService);
  private readonly sb = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly brand = environment.brand;

  protected email = this.auth.lastEmail;
  protected password = '';
  protected remember = this.auth.rememberMe;
  protected readonly showPw = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly mode = signal<Mode>('login');
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
    if (this.route.snapshot.queryParamMap.get('reset')) {
      this.mode.set('reset');
      return;
    }
    const p = this.auth.profile();
    if (p) await this.routeFor(p).catch((e: Error) => this.error.set(e.message));
  }

  async submit() {
    this.error.set('');
    this.info.set('');
    this.elsewhere.set(null);
    this.busy.set(true);
    try {
      if (this.mode() === 'forgot') {
        await this.auth.sendReset(this.email.trim());
        this.info.set('If that email has an account, a reset link is on its way.');
        this.mode.set('login');
      } else if (this.mode() === 'reset') {
        await this.auth.updatePassword(this.password);
        this.info.set('Password updated. You are signed in.');
        const p = this.auth.profile();
        if (p) await this.routeFor(p);
      } else {
        const p = await this.auth.signIn(this.email.trim(), this.password, this.remember);
        await this.routeFor(p);
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
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
