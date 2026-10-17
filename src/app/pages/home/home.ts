import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';
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
  protected readonly brand = environment.brand;
  protected readonly year = new Date().getFullYear();

  protected token = '';
  protected labSlug = '';

  protected readonly t = computed(() => this.tenant.tenant());
  protected readonly pages = this.tenant.pages;
  /** Signed-in users get a shortcut to their own area — only where that area lives. */
  protected readonly dashboardLink = computed(() => {
    if (this.t()) return this.auth.isLabUser() && this.auth.profile()?.tenant_id === this.t()!.id ? '/lab' : null;
    return this.auth.isSuperAdmin() ? '/admin' : null;
  });
  protected readonly waLink = computed(() => {
    const n = (this.t()?.whatsapp_number || this.t()?.contact_phone || '').replace(/\D/g, '');
    return n ? `https://wa.me/${n.length === 10 ? '91' + n : n}` : null;
  });

  protected readonly features = [
    { icon: 'building-2', title: 'Every lab, its own brand', text: 'Subdomain, logo, colours, favicon and cover page per client — all set from one admin console.' },
    { icon: 'zap', title: 'Token in 5 seconds', text: 'Reception registers the patient, picks tests and prints a token. Works on the front-desk PC or a phone.' },
    { icon: 'send', title: 'Reports on WhatsApp', text: 'Drop the PDF, tap Notify. Patients track progress live and download the official report — no login.' },
    { icon: 'sparkles', title: 'AI report explainer', text: 'Plain-language summaries patients understand, with the medical disclaimer built in.' },
    { icon: 'wallet', title: 'Flexible plans', text: 'Monthly, yearly, pay-per-report or hybrid pricing with free trial days per client.' },
    { icon: 'life-buoy', title: 'Support via Circles', text: 'Labs raise tickets with screenshots right inside the app; they land in Circles with full context.' },
  ];

  track() {
    const tk = this.token.trim();
    if (tk) this.router.navigate(['/track', tk.toUpperCase()]);
  }

  openLab() {
    const s = this.labSlug.trim().toLowerCase();
    if (s) location.href = this.tenant.labUrl(s, '/');
  }
}
