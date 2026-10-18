import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { TenantPublic } from './models';
import { SupabaseService } from './supabase.service';

const SLUG_KEY = 'sa_lab_slug';

export interface TenantResolution {
  slug: string | null;
  domain: string | null;
}

/**
 * Works out which lab this browser is looking at:
 *  1. srisai.spreadapps.in          -> slug "srisai"
 *  2. reports.srisailabs.com        -> custom domain lookup
 *  3. ?lab=srisai (netlify / local) -> slug, remembered for the session
 * No match = the SpreadApps platform itself (landing + super admin).
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly sb = inject(SupabaseService);
  private readonly doc = inject(DOCUMENT);

  readonly tenant = signal<TenantPublic | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly resolution = signal<TenantResolution>({ slug: null, domain: null });

  readonly isPlatform = computed(() => !this.tenant());
  readonly name = computed(() => this.tenant()?.name ?? `${environment.brand.name} ${environment.brand.product}`);
  readonly logo = computed(() => this.tenant()?.logo_url || environment.brand.logo);
  readonly slug = computed(() => this.tenant()?.slug ?? null);
  readonly pages = computed(() => ({
    show_track: true,
    show_ai: true,
    show_support: true,
    show_whatsapp: true,
    show_powered_by: true,
    show_security: true,
    ...(this.tenant()?.pages ?? {}),
  }));
  readonly trialDaysLeft = computed(() => {
    const t = this.tenant();
    if (!t || t.status !== 'trial') return null;
    return Math.max(0, Math.ceil((new Date(t.trial_ends_at).getTime() - Date.now()) / 86_400_000));
  });

  static detect(hostname: string, search: string): TenantResolution {
    const host = hostname.toLowerCase();
    const q = new URLSearchParams(search).get('lab')?.trim().toLowerCase() || null;
    if (q === 'none' || q === 'platform') {
      try { sessionStorage.removeItem(SLUG_KEY); } catch { /* ignore */ }
      return { slug: null, domain: null };
    }
    if (q) {
      try { sessionStorage.setItem(SLUG_KEY, q); } catch { /* ignore */ }
      return { slug: q, domain: null };
    }

    const base = environment.baseDomain;
    if (host.endsWith('.' + base)) {
      const sub = host.slice(0, -(base.length + 1)).split('.')[0];
      if (sub && !environment.reservedSubdomains.includes(sub)) return { slug: sub, domain: null };
      return { slug: null, domain: null };
    }

    const isPreviewHost = host === base || host === 'localhost' || host.endsWith('.netlify.app') || /^[\d.]+$/.test(host);
    if (isPreviewHost) {
      let stored: string | null = null;
      try { stored = sessionStorage.getItem(SLUG_KEY); } catch { /* ignore */ }
      return { slug: stored ?? environment.demoTenant, domain: null };
    }

    // Any other host is a lab's own custom domain
    return { slug: null, domain: host };
  }

  async init(): Promise<void> {
    const res = TenantService.detect(location.hostname, location.search);
    this.resolution.set(res);
    if (res.slug || res.domain) {
      const { data, error } = await this.sb.client.rpc('resolve_tenant', { p_slug: res.slug, p_domain: res.domain });
      if (!error && data) this.tenant.set(data as TenantPublic);
      else this.notFound.set(true);
    }
    this.applyBranding();
    this.loading.set(false);
  }

  /** Re-fetch after the admin edits branding (used by preview). */
  async refresh(): Promise<void> {
    const t = this.tenant();
    if (!t) return;
    const { data } = await this.sb.client.rpc('resolve_tenant', { p_slug: t.slug });
    if (data) this.tenant.set(data as TenantPublic);
    this.applyBranding();
  }

  /** Link that opens a given lab, whichever host we are on. */
  labUrl(slug: string, path = '/'): string {
    const host = location.hostname;
    if (host.endsWith('.' + environment.baseDomain) || host === environment.baseDomain) {
      return `${location.protocol}//${slug}.${environment.baseDomain}${path}`;
    }
    const sep = path.includes('?') ? '&' : '?';
    return `${location.origin}${path}${sep}lab=${slug}`;
  }

  /** True when this browser is on the admin/platform host (not a lab subdomain or lab custom domain). */
  isPlatformHost(): boolean {
    const host = location.hostname;
    return host === environment.platformHost || host === `ailab.${environment.baseDomain}` || host === 'localhost' || host.endsWith('.netlify.app') || /^[d.]+$/.test(host);
  }

  platformUrl(path = '/'): string {
    if (this.isPlatformHost()) {
      const sep = path.includes('?') ? '&' : '?';
      return `${location.origin}${path}${sep}lab=none`;
    }
    return `https://${environment.platformHost}${path}`;
  }

  /** Same browser origin → session carries over; different origin → user must sign in there. */
  isSameOrigin(url: string): boolean {
    return new URL(url, location.href).origin === location.origin;
  }

  private applyBranding(): void {
    const t = this.tenant();
    const root = this.doc.documentElement;
    root.style.setProperty('--brand', t?.brand_color || '#6366F1');
    root.style.setProperty('--accent', t?.accent_color || '#10B981');

    this.doc.title = t ? `${t.name}` : `${environment.brand.name} ${environment.brand.product}`;
    const icon = t?.favicon_url || t?.logo_url || 'favicon.png';
    this.doc.getElementById('app-favicon')?.setAttribute('href', icon);
    this.doc.getElementById('app-touch-icon')?.setAttribute('href', t?.logo_url || 'icons/apple-touch-icon.png');
    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', t?.brand_color || '#6366F1');
  }
}
