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

  protected readonly t = computed(() => this.tenant.tenant());
  protected readonly title = computed(() =>
    this.mode() === 'forgot' ? 'Reset your password' : this.mode() === 'reset' ? 'Choose a new password'
      : this.t()?.pages?.login_title || (this.t() ? 'Staff sign in' : 'Welcome back'),
  );
  protected readonly subtitle = computed(() =>
    this.t()?.pages?.login_subtitle ||
    (this.t() ? `Sign in to the ${this.t()!.name} workspace` : `Sign in to ${this.brand.name} ${this.brand.product}`),
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

  /** Sends each role to the right home, enforcing that lab users stay in their own lab. */
  private async routeFor(p: Profile) {
    const next = this.route.snapshot.queryParamMap.get('next');
    const lab = this.t();
    if (p.role === 'super_admin') {
      await this.router.navigateByUrl(next || (lab ? '/lab' : '/admin'));
      return;
    }
    if (lab && p.tenant_id === lab.id) {
      await this.router.navigateByUrl(next?.startsWith('/lab') ? next : '/lab');
      return;
    }
    // Lab user signed in on the wrong host: send them to their own lab
    const { data } = await this.sb.client.from('tenants').select('slug').eq('id', p.tenant_id ?? '').maybeSingle();
    if (data?.slug) {
      location.href = this.tenant.labUrl(data.slug, '/lab');
      return;
    }
    await this.auth.signOut();
    throw new Error('This account is not linked to any lab yet. Contact SpreadApps.');
  }
}
