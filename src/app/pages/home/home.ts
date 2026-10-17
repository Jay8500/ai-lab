import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { BrandMark } from '../../shared/brand-mark';

/** Cover page: a lab's branded landing when on a lab host, otherwise the SpreadApps AI-Lab landing. */
@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink, LucideAngularModule, BrandMark],
  templateUrl: './home.html',
})
export class HomePage {
  protected readonly tenant = inject(TenantService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly brand = environment.brand;
  protected readonly year = new Date().getFullYear();

  protected token = '';

  protected readonly t = computed(() => this.tenant.tenant());
  protected readonly pages = this.tenant.pages;
  /** Lab staff signed in on their own lab get a shortcut to the workspace. */
  protected readonly dashboardLink = computed(() =>
    this.t() && this.auth.isLabUser() && this.auth.profile()?.tenant_id === this.t()!.id ? '/lab' : null,
  );
  protected readonly waLink = computed(() => {
    const n = (this.t()?.whatsapp_number || this.t()?.contact_phone || '').replace(/\D/g, '');
    return n ? `https://wa.me/${n.length === 10 ? '91' + n : n}` : null;
  });

  constructor() {
    // The platform address is the admin console only — no public landing, no customer list.
    if (!this.tenant.tenant() && !this.tenant.notFound()) {
      this.router.navigateByUrl(this.auth.isPlatformAdmin() ? '/admin' : '/login', { replaceUrl: true });
    }
  }

  track() {
    const tk = this.token.trim();
    if (!tk) return this.toast.warn('Enter the token from your receipt.');
    if (tk) this.router.navigate(['/track', tk.toUpperCase()]);
  }
}
