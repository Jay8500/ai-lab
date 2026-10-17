import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AdminService, monthlyValue } from '../../core/admin.service';
import { BillingEvent, Tenant, TenantPages, TenantSecrets, TestItem } from '../../core/models';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { SidebarState } from '../../shared/sidebar';
import { TeamManager } from '../../shared/team-manager';
import { LabStatusPill } from '../lab-status-pill';

type Tab = 'branding' | 'domain' | 'pages' | 'tests' | 'integrations' | 'plan' | 'users';

interface SecretField {
  key: keyof TenantSecrets;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

@Component({
  selector: 'app-admin-lab-editor',
  imports: [FormsModule, RouterLink, LucideAngularModule, DatePipe, DecimalPipe, LabStatusPill, TeamManager],
  templateUrl: './lab-editor.html',
})
export class AdminLabEditor implements OnInit {
  readonly id = input.required<string>();
  protected readonly admin = inject(AdminService);
  protected readonly tenantSvc = inject(TenantService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly baseDomain = environment.baseDomain;
  protected readonly sidebar = SidebarState;

  protected readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'branding', label: 'Branding', icon: 'palette' },
    { key: 'domain', label: 'Domain', icon: 'globe' },
    { key: 'pages', label: 'Pages', icon: 'layout-template' },
    { key: 'tests', label: 'Tests', icon: 'test-tube' },
    { key: 'integrations', label: 'API keys', icon: 'key-round' },
    { key: 'plan', label: 'Plan & billing', icon: 'credit-card' },
    { key: 'users', label: 'Admins & staff', icon: 'users' },
  ];
  protected readonly tab = signal<Tab>('branding');

  protected draft: Tenant | null = null;
  protected pages: TenantPages = {};
  protected tests: TestItem[] = [];
  protected secrets: TenantSecrets | null = null;
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);
  protected readonly uploading = signal<string | null>(null);
  protected readonly reveal = signal<Record<string, boolean>>({});

  protected readonly bills = signal<BillingEvent[]>([]);
  protected nb = { kind: 'subscription' as BillingEvent['kind'], amount: 0, period: new Date().toISOString().slice(0, 7), status: 'due' as BillingEvent['status'], note: '' };

  protected readonly row = computed(() => this.admin.rows().find((r) => r.id === this.id()));

  protected readonly secretGroups: { title: string; icon: string; hint: string; fields: SecretField[] }[] = [
    {
      title: 'WhatsApp', icon: 'message-circle', hint: 'Automatic report delivery (Meta Cloud API / Gupshup / Interakt / WATI). Without keys, staff use click-to-chat.',
      fields: [
        { key: 'whatsapp_provider', label: 'Provider', placeholder: 'meta | gupshup | interakt | wati' },
        { key: 'whatsapp_phone_id', label: 'Phone number ID / sender' },
        { key: 'whatsapp_api_key', label: 'API key / access token', secret: true },
      ],
    },
    {
      title: 'SMS', icon: 'smartphone', hint: 'DLT-registered SMS for report-ready alerts.',
      fields: [
        { key: 'sms_provider', label: 'Provider', placeholder: 'msg91 | twilio | textlocal' },
        { key: 'sms_sender_id', label: 'Sender ID', placeholder: 'SRISAI' },
        { key: 'sms_api_key', label: 'API key', secret: true },
      ],
    },
    {
      title: 'Payments (Razorpay)', icon: 'indian-rupee', hint: 'Online payment links for patients.',
      fields: [
        { key: 'razorpay_key_id', label: 'Key ID', placeholder: 'rzp_live_…' },
        { key: 'razorpay_key_secret', label: 'Key secret', secret: true },
      ],
    },
    {
      title: 'AI report explainer', icon: 'sparkles', hint: 'Used server-side to write plain-language summaries.',
      fields: [
        { key: 'ai_provider', label: 'Provider', placeholder: 'anthropic | openai | gemini' },
        { key: 'ai_api_key', label: 'API key', secret: true },
      ],
    },
    {
      title: 'Circles support', icon: 'life-buoy', hint: 'Routes this lab\'s tickets into a Circles project.',
      fields: [
        { key: 'circles_project_id', label: 'Circles project ID' },
        { key: 'circles_api_key', label: 'Circles API key', secret: true },
      ],
    },
  ];

  protected readonly pageToggles: { key: keyof TenantPages; label: string; hint: string }[] = [
    { key: 'show_track', label: 'Patient report tracking', hint: 'Token search on cover page & /track portal' },
    { key: 'show_ai', label: 'AI report explanation', hint: 'Summary card with disclaimer on the patient portal' },
    { key: 'show_whatsapp', label: 'WhatsApp contact', hint: 'Chat button on the cover page' },
    { key: 'show_support', label: 'Circles support button', hint: 'Help / raise-ticket for lab staff' },
    { key: 'show_powered_by', label: '“Powered by SpreadApps”', hint: 'Footer credit on public pages' },
  ];

  async ngOnInit() {
    await this.admin.ensureLoaded();
    const t = this.admin.tenants().find((x) => x.id === this.id());
    if (!t) {
      this.toast.error('Lab not found');
      this.router.navigateByUrl('/admin/labs');
      return;
    }
    this.load(t);
    this.secrets = await this.admin.getSecrets(t.id);
    this.refreshSide();
  }

  private load(t: Tenant) {
    this.draft = structuredClone(t);
    this.pages = { show_track: true, show_ai: true, show_support: true, show_whatsapp: true, show_powered_by: true, ...(t.pages ?? {}) };
    this.tests = structuredClone(t.test_catalog ?? []);
    this.dirty.set(false);
  }

  private async refreshSide() {
    this.bills.set(await this.admin.billing(this.id()));
  }

  touch() {
    this.dirty.set(true);
  }

  async save() {
    if (!this.draft) return;
    this.saving.set(true);
    try {
      const d = this.draft;
      const saved = await this.admin.saveTenant(d.id, {
        name: d.name, tagline: d.tagline, logo_url: d.logo_url, favicon_url: d.favicon_url, cover_url: d.cover_url,
        brand_color: d.brand_color, accent_color: d.accent_color, contact_phone: d.contact_phone, contact_email: d.contact_email,
        whatsapp_number: d.whatsapp_number, address: d.address,
        slug: d.slug.trim().toLowerCase(), custom_domain: d.custom_domain?.trim().toLowerCase() || null, token_prefix: d.token_prefix.toUpperCase(),
        status: d.status, plan_id: d.plan_id || null, custom_price: d.custom_price === null || (d.custom_price as unknown) === '' ? null : Number(d.custom_price),
        trial_days: Number(d.trial_days), trial_started_at: d.trial_started_at, subscription_ends_at: d.subscription_ends_at || null,
        notes: d.notes, pages: this.pages,
        test_catalog: this.tests.filter((t) => t.code.trim()).map((t) => ({ ...t, code: t.code.trim().toUpperCase(), price: Number(t.price), tat_hours: Number(t.tat_hours) || undefined })),
      });
      if (this.secrets) await this.admin.saveSecrets(this.secrets);
      this.load(saved);
      this.toast.success('Saved — changes are live on the lab pages');
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  discard() {
    const t = this.admin.tenants().find((x) => x.id === this.id());
    if (t) this.load(t);
  }

  async upload(kind: 'logo' | 'favicon' | 'cover', e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f || !this.draft) return;
    this.uploading.set(kind);
    try {
      const url = await this.admin.uploadBranding(this.draft.id, kind, f);
      this.draft[`${kind}_url`] = url;
      this.touch();
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.uploading.set(null);
    }
  }

  toggleReveal(key: string) {
    this.reveal.update((r) => ({ ...r, [key]: !r[key] }));
  }

  // ── Tests ──
  addTest() {
    this.tests = [...this.tests, { code: '', name: '', price: 0, tat_hours: 6 }];
    this.touch();
  }
  removeTest(i: number) {
    this.tests = this.tests.filter((_, idx) => idx !== i);
    this.touch();
  }

  // ── Plan ──
  protected readonly planPreview = computed(() => this.row()?.mrr ?? 0);
  previewMrr(): number {
    if (!this.draft) return 0;
    const plan = this.admin.plans().find((p) => p.id === this.draft!.plan_id);
    return monthlyValue({ ...this.draft, status: 'active' }, plan, this.row()?.stats?.reports_month ?? 0);
  }

  extendTrial(days: number) {
    if (!this.draft) return;
    this.draft.trial_days = Number(this.draft.trial_days) + days;
    if (this.draft.status === 'expired') this.draft.status = 'trial';
    this.touch();
  }

  restartTrial() {
    if (!this.draft) return;
    this.draft.trial_started_at = new Date().toISOString();
    this.draft.status = 'trial';
    this.touch();
  }

  activate(months: number) {
    if (!this.draft) return;
    const end = new Date();
    end.setMonth(end.getMonth() + months);
    this.draft.status = 'active';
    this.draft.subscription_ends_at = end.toISOString();
    this.touch();
  }

  dateInput(v: string | null): string {
    return v ? v.slice(0, 10) : '';
  }
  setDate(field: 'trial_started_at' | 'subscription_ends_at', v: string) {
    if (!this.draft) return;
    this.draft[field] = v ? new Date(v).toISOString() : (field === 'trial_started_at' ? new Date().toISOString() : null) as string;
    this.touch();
  }

  async addBill() {
    try {
      await this.admin.addBilling({ ...this.nb, tenant_id: this.id(), amount: Number(this.nb.amount), paid_at: this.nb.status === 'paid' ? new Date().toISOString() : null });
      this.bills.set(await this.admin.billing(this.id()));
      this.nb.amount = 0;
      this.nb.note = '';
      this.toast.success('Billing entry added');
    } catch (e) {
      this.toast.error((e as Error).message);
    }
  }

  async markBill(b: BillingEvent, status: BillingEvent['status']) {
    await this.admin.setBillingStatus(b.id, status);
    this.bills.set(await this.admin.billing(this.id()));
  }

  async deleteLab() {
    if (!this.draft) return;
    const typed = prompt(`This permanently deletes ${this.draft.name}, all its visits and logins' lab access.\nType the subdomain "${this.draft.slug}" to confirm.`);
    if (typed !== this.draft.slug) return;
    try {
      await this.admin.deleteTenant(this.draft.id);
      this.toast.success('Lab deleted');
      this.router.navigateByUrl('/admin/labs');
    } catch (e) {
      this.toast.error((e as Error).message);
    }
  }

  async copy(text: string) {
    await navigator.clipboard.writeText(text);
    this.toast.success('Copied');
  }
}
