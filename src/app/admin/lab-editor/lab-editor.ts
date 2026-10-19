import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AdminService, monthlyValue } from '../../core/admin.service';
import { BillingEvent, Profile, Tenant, TenantPages, TenantSecrets, TestItem, BILLING_KINDS, billingLabel } from '../../core/models';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { PaymentReviewService } from '../../core/payment-review.service';
import { SidebarState } from '../../shared/sidebar';
import { TeamManager } from '../../shared/team-manager';
import { LabStatusPill } from '../lab-status-pill';
import { DialogService } from '../../core/dialog.service';
import { FormField } from '../../shared/form-field';
import { TestParamsEditor } from '../../shared/test-params-editor';
import { DevicesManager } from '../../shared/devices-manager';

type Tab = 'branding' | 'domain' | 'pages' | 'tests' | 'devices' | 'integrations' | 'plan' | 'users';

interface SecretField {
  key: keyof TenantSecrets;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

@Component({
  selector: 'app-admin-lab-editor',
  imports: [FormsModule, RouterLink, LucideAngularModule, DatePipe, DecimalPipe, LabStatusPill, TeamManager, FormField, TestParamsEditor, DevicesManager],
  templateUrl: './lab-editor.html',
})
export class AdminLabEditor implements OnInit {
  /** Route param: the lab's subdomain (old links with the internal id still work) */
  readonly ref = input.required<string>();
  private readonly tenantId = signal('');
  protected id = this.tenantId.asReadonly();
  protected readonly admin = inject(AdminService);
  protected readonly tenantSvc = inject(TenantService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  // Zoneless app: the form lives in plain fields, so tell Angular when they are (re)loaded
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly baseDomain = environment.baseDomain;
  protected readonly sidebar = SidebarState;

  protected readonly tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'branding', label: 'Branding', icon: 'palette' },
    { key: 'domain', label: 'Domain', icon: 'globe' },
    { key: 'pages', label: 'Pages', icon: 'layout-template' },
    { key: 'tests', label: 'Tests', icon: 'test-tube' },
    { key: 'devices', label: 'Devices', icon: 'monitor' },
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
  protected readonly labAdmins = signal<Profile[]>([]);
  protected nb = this.blankBill();
  protected readonly billingKinds = BILLING_KINDS;
  protected readonly billingLabel = billingLabel;
  protected notifyLab = true;

  private blankBill() {
    const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    return { kind: 'subscription' as BillingEvent['kind'], amount: 0, period: new Date().toISOString().slice(0, 7), status: 'due' as BillingEvent['status'], note: '', due_date: due };
  }

  protected readonly row = computed(() => this.admin.rows().find((r) => r.id === this.id()));

  protected readonly secretGroups: { title: string; icon: string; img?: string; hint: string; fields: SecretField[] }[] = [
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
      title: 'AI report explainer', icon: 'sparkles', hint: 'The lab’s own key. Runs automatically after each report upload. Default: Anthropic Claude Opus 5.5.',
      fields: [
        { key: 'ai_provider', label: 'Provider', placeholder: 'anthropic (default) | openai | gemini' },
        { key: 'ai_api_key', label: 'API key', secret: true },
        { key: 'ai_model', label: 'Model (optional)', placeholder: 'blank = claude-opus-5-5' },
      ],
    },
    {
      title: 'Circles support', icon: 'life-buoy', img: 'brand/circles-logo.svg', hint: 'Routes this lab\'s tickets into a Circles project.',
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
    { key: 'show_video', label: '“How it works” video', hint: 'Short patient walkthrough on the cover page' },
    { key: 'show_security', label: 'Security & privacy section', hint: 'Explains how patient data is protected (great for demos)' },
    { key: 'show_powered_by', label: '“Powered by SpreadApps”', hint: 'Footer credit on public pages' },
  ];

  async ngOnInit() {
    await this.admin.ensureLoaded();
    const ref = this.ref().toLowerCase();
    const t = this.admin.tenants().find((x) => x.slug === ref || x.id === ref);
    if (!t) {
      this.toast.error('Lab not found');
      this.router.navigateByUrl('/admin/labs');
      return;
    }
    this.tenantId.set(t.id);
    this.load(t);
    this.checkDomain(t.slug);
    this.secrets = await this.admin.getSecrets(t.id);
    this.cdr.markForCheck();
    this.refreshSide();
  }

  private load(t: Tenant) {
    this.draft = structuredClone(t);
    this.pages = { show_track: true, show_ai: true, show_support: true, show_whatsapp: true, show_powered_by: true, show_security: true, ...(t.pages ?? {}) };
    this.tests = structuredClone(t.test_catalog ?? []);
    this.dirty.set(false);
    this.cdr.markForCheck();
  }

  private async refreshSide() {
    const [bills, users] = await Promise.all([this.admin.billing(this.id()), this.admin.users(this.id()).catch(() => [])]);
    this.bills.set(bills);
    this.labAdmins.set(users.filter((u) => u.role === 'lab_owner'));
  }

  touch() {
    this.dirty.set(true);
  }

  /** Errors show after the first Save attempt, then update live as fields are fixed. */
  protected readonly submitted = signal(false);

  async save() {
    if (!this.draft) return;
    this.submitted.set(true);
    const errs = this.errs();
    const keys = Object.keys(errs);
    if (keys.length) {
      const first = this.tabs.find((t) => keys.some((k) => this.tabOf(k) === t.key))!;
      if (!keys.some((k) => this.tabOf(k) === this.tab())) this.tab.set(first.key);
      const here = keys.filter((k) => this.tabOf(k) === this.tab()).length;
      return this.toast.warn(`Fix ${here} highlighted field${here === 1 ? '' : 's'} on ${this.tabs.find((t) => t.key === this.tab())!.label}.`);
    }
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
      if (saved.slug !== this.ref()) {
        const dom = await this.admin.labDomain('add', saved.slug, this.ref());
        if (!dom.ok) this.toast.warn(dom.message ?? 'Update the subdomain in Netlify manually.');
        this.checkDomain(saved.slug);
        this.router.navigate(['/admin/labs', saved.slug], { replaceUrl: true });
      }
      this.toast.success('Saved. Changes are live.');
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.saving.set(false);
    }
  }

  private static readonly TAB_OF: Record<string, Tab> = {
    name: 'branding', tagline: 'branding', logo_url: 'branding', favicon_url: 'branding', cover_url: 'branding', brand_color: 'branding', accent_color: 'branding',
    contact_phone: 'branding', whatsapp_number: 'branding', contact_email: 'branding', address: 'branding',
    slug: 'domain', custom_domain: 'domain', token_prefix: 'domain',
    hero_title: 'pages', hero_subtitle: 'pages', video_url: 'pages', footer_note: 'pages', grievance_name: 'pages', grievance_email: 'pages', grievance_phone: 'pages',
    ai_provider: 'integrations', ai_api_key: 'integrations', ai_model: 'integrations', whatsapp_provider: 'integrations', sms_provider: 'integrations', sms_sender_id: 'integrations', razorpay_key_id: 'integrations',
    custom_price: 'plan', trial_days: 'plan', subscription_ends_at: 'plan',
  };
  private tabOf(key: string): Tab {
    return key.startsWith('test') ? 'tests' : AdminLabEditor.TAB_OF[key] ?? 'branding';
  }
  tabHasError(t: Tab) {
    return Object.keys(this.errs()).some((k) => this.tabOf(k) === t);
  }

  /** Every problem in the form, keyed by field (tests as test0, test1…). Empty until Save is pressed. */
  errs(): Record<string, string> {
    if (!this.submitted() || !this.draft) return {};
    const d = this.draft;
    const e: Record<string, string> = {};
    const v = (x: string | null | undefined) => (x ?? '').trim();
    const email = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
    const phone = (x: string) => /^\+?[\d\s()-]{8,20}$/.test(x) && x.replace(/\D/g, '').length >= 8 && x.replace(/\D/g, '').length <= 13;
    const url = (x: string) => /^(https?:\/\/|\/|brand\/)[^\s]+$/i.test(x);
    const hex = /^#[0-9a-f]{6}$/i;

    // Branding
    if (!v(d.name)) e['name'] = 'Enter the lab’s name.';
    else if (v(d.name).length < 3) e['name'] = 'Use at least 3 characters.';
    if (v(d.tagline).length > 120) e['tagline'] = 'Keep the tagline under 120 characters.';
    for (const k of ['logo_url', 'favicon_url', 'cover_url'] as const) if (v(d[k]) && !url(v(d[k]))) e[k] = 'Paste a full link starting with https://';
    if (!hex.test(v(d.brand_color))) e['brand_color'] = 'Use a colour code like #6366F1.';
    if (!hex.test(v(d.accent_color))) e['accent_color'] = 'Use a colour code like #06B6D4.';
    if (v(d.contact_phone) && !phone(v(d.contact_phone))) e['contact_phone'] = 'Enter a valid phone number, e.g. +91 98765 43210.';
    if (v(d.whatsapp_number) && !/^\d{10,15}$/.test(v(d.whatsapp_number))) e['whatsapp_number'] = 'Digits only with country code, e.g. 919876543210.';
    else if (/^\d{10}$/.test(v(d.whatsapp_number))) e['whatsapp_number'] = 'Add the country code in front — 91 for India.';
    if (v(d.contact_email) && !email.test(v(d.contact_email))) e['contact_email'] = 'That email doesn’t look right.';
    if (v(d.address).length > 200) e['address'] = 'Keep the address under 200 characters.';

    // Domain
    const slug = v(d.slug).toLowerCase();
    if (!slug) e['slug'] = 'Choose a subdomain.';
    else if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) || slug.endsWith('-')) e['slug'] = 'Lowercase letters, numbers and dashes (2–41), not starting or ending with a dash.';
    else if (environment.reservedSubdomains.includes(slug)) e['slug'] = 'That name is reserved — pick another.';
    else if (this.admin.tenants().some((t) => t.slug === slug && t.id !== d.id)) e['slug'] = 'Another lab already uses this subdomain.';
    const cd = v(d.custom_domain).toLowerCase();
    if (cd && !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(cd)) e['custom_domain'] = 'Enter just the domain, e.g. reports.mylab.com (no https://).';
    else if (cd && (cd === environment.baseDomain || cd.endsWith('.' + environment.baseDomain))) e['custom_domain'] = `Use the subdomain field for ${environment.baseDomain} addresses.`;
    if (!/^[A-Z]{1,5}$/i.test(v(d.token_prefix))) e['token_prefix'] = '1 to 5 letters, e.g. SRS.';

    // Pages
    const p = this.pages as Record<string, string | undefined>;
    if (v(p['hero_title']).length > 90) e['hero_title'] = 'Keep the title under 90 characters.';
    if (v(p['hero_subtitle']).length > 240) e['hero_subtitle'] = 'Keep the subtitle under 240 characters.';
    if (v(p['grievance_email']) && !email.test(v(p['grievance_email']))) e['grievance_email'] = 'That email doesn’t look right.';
    if (v(p['grievance_phone']) && !phone(v(p['grievance_phone']))) e['grievance_phone'] = 'Enter a valid phone number.';
    if ((v(p['grievance_email']) || v(p['grievance_phone'])) && !v(p['grievance_name'])) e['grievance_name'] = 'Add the officer’s name.';
    const vid = v(p['video_url']);
    if (vid && !/^https:\/\/\S+$/i.test(vid)) e['video_url'] = 'Paste a full link starting with https://';
    else if (vid && !/(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{11}|\.(mp4|webm)(\?\S*)?$/i.test(vid)) e['video_url'] = 'Use a YouTube link or a direct .mp4 / .webm file link.';

    // Tests
    const seen = new Set<string>();
    this.tests.forEach((t, i) => {
      const code = v(t.code).toUpperCase();
      const name = v(t.name);
      if (!code && !name) return;
      const pr = t.price as unknown;
      const h = t.tat_hours as unknown;
      let m = '';
      if (!code) m = 'Code is missing — e.g. CBP.';
      else if (!/^[A-Z0-9-]{2,12}$/.test(code)) m = 'Code: 2–12 letters, numbers or -.';
      else if (seen.has(code)) m = `Code ${code} is used twice.`;
      else if (!name) m = 'Name is missing.';
      else if (pr === '' || pr === null || pr === undefined || !(Number(pr) >= 0)) m = 'Price: enter 0 or more.';
      else if (h !== '' && h !== null && h !== undefined && (!(Number(h) >= 1) || Number(h) > 720)) m = 'Report time: 1–720 hours, or leave empty.';
      seen.add(code);
      if (m) e['test' + i] = m;
    });

    // API keys (only format checks; empty is fine)
    const s = this.secrets as unknown as Record<string, string | null> | null;
    if (s) {
      const prov = v(s['ai_provider']).toLowerCase();
      if (prov && !['anthropic', 'openai', 'gemini'].includes(prov)) e['ai_provider'] = 'Use anthropic, openai or gemini.';
      const key = v(s['ai_api_key']);
      if (key && /\s/.test(key)) e['ai_api_key'] = 'Keys have no spaces — paste it again.';
      else if (key && (prov || 'anthropic') === 'anthropic' && !key.startsWith('sk-ant-')) e['ai_api_key'] = 'Anthropic keys start with sk-ant-.';
      else if (key && prov === 'openai' && !key.startsWith('sk-')) e['ai_api_key'] = 'OpenAI keys start with sk-.';
      if (v(s['ai_model']) && !/^[a-z0-9][a-z0-9.:_-]{2,80}$/i.test(v(s['ai_model']))) e['ai_model'] = 'Model names look like claude-opus-5-5.';
      const wp = v(s['whatsapp_provider']).toLowerCase();
      if (wp && !['meta', 'gupshup', 'interakt', 'wati'].includes(wp)) e['whatsapp_provider'] = 'Use meta, gupshup, interakt or wati.';
      const sp = v(s['sms_provider']).toLowerCase();
      if (sp && !['msg91', 'twilio', 'textlocal'].includes(sp)) e['sms_provider'] = 'Use msg91, twilio or textlocal.';
      if (v(s['sms_sender_id']) && !/^[A-Za-z]{6}$/.test(v(s['sms_sender_id']))) e['sms_sender_id'] = 'DLT sender IDs are 6 letters, e.g. SRISAI.';
      if (v(s['razorpay_key_id']) && !/^rzp_(live|test)_[A-Za-z0-9]+$/.test(v(s['razorpay_key_id']))) e['razorpay_key_id'] = 'Razorpay key IDs start with rzp_live_ or rzp_test_.';
    }

    // Plan
    const cp = d.custom_price as unknown;
    if (cp !== null && cp !== '' && cp !== undefined && !(Number(cp) >= 0)) e['custom_price'] = 'Can’t be negative — leave empty to use the plan price.';
    const td = d.trial_days as unknown;
    if (td === '' || td === null || !Number.isInteger(Number(td)) || Number(td) < 0 || Number(td) > 365) e['trial_days'] = 'A whole number of days, 0 to 365.';
    if (d.status === 'active' && !d.subscription_ends_at) e['subscription_ends_at'] = 'Set when the paid period ends (or use Activate).';
    return e;
  }

  discard() {
    const t = this.admin.tenants().find((x) => x.id === this.id());
    if (t) this.load(t);
  }

  async upload(kind: 'logo' | 'favicon' | 'cover', e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f || !this.draft) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (!allowed.includes(f.type)) return this.toast.warn('Use a PNG, JPG, WebP, SVG or ICO image.');
    if (f.size > 5 * 1024 * 1024) return this.toast.warn('Image must be under 5 MB.');
    this.uploading.set(kind);
    try {
      const url = await this.admin.uploadBranding(this.draft.id, kind, f);
      this.draft[`${kind}_url`] = url;
      this.touch();
      this.toast.info(`${kind[0].toUpperCase() + kind.slice(1)} uploaded — click Save & publish.`);
    } catch (err) {
      this.toast.fail(err, `Could not upload the ${kind}.`);
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
  protected readonly paramsFor = signal<number | null>(null);
  setParams(i: number, t: TestItem) {
    this.tests = this.tests.map((x, j) => (j === i ? { ...x, params: t.params, sample: t.sample, department: t.department } : x));
    this.paramsFor.set(null);
    this.touch();
    this.toast.info('Values updated — press Save & publish to keep them.');
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

  protected readonly billSubmitted = signal(false);

  billErr(): { amount?: string; period?: string; due_date?: string } {
    if (!this.billSubmitted()) return {};
    const e: { amount?: string; period?: string; due_date?: string } = {};
    const a = Number(this.nb.amount);
    if (!(a > 0)) e.amount = 'Enter an amount above ₹0.';
    else if (a > 10_000_000) e.amount = 'That amount looks too high — check it.';
    else if (Math.round(a * 100) !== a * 100) e.amount = 'Use at most 2 decimals.';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test((this.nb.period ?? '').trim())) e.period = 'Use year-month, e.g. 2026-10.';
    if (this.nb.status === 'due' && !this.nb.due_date) e.due_date = 'When should the lab pay by?';
    return e;
  }

  async addBill() {
    this.billSubmitted.set(true);
    if (Object.keys(this.billErr()).length) return this.toast.warn('Fix the highlighted charge details.');
    try {
      const b = await this.admin.addBilling({ ...this.nb, tenant_id: this.id(), amount: Number(this.nb.amount), due_date: this.nb.due_date || null, paid_at: this.nb.status === 'paid' ? new Date().toISOString() : null });
      let note = 'Charge added.';
      if (this.notifyLab && b.status === 'due') {
        try {
          await this.admin.notifyBilling(b, 'new');
          note = 'Charge added and lab admin notified.';
        } catch (e) {
          this.toast.fail(e, 'Charge added, but the notice could not be sent.');
        }
      }
      this.bills.set(await this.admin.billing(this.id()));
      this.nb = this.blankBill();
      this.billSubmitted.set(false);
      this.toast.success(note);
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async remind(b: BillingEvent) {
    try {
      await this.admin.notifyBilling(b, 'reminder');
      this.bills.set(await this.admin.billing(this.id()));
      this.toast.success('Payment reminder sent.');
    } catch (e) {
      this.toast.fail(e, 'Could not send the reminder.');
    }
  }

  private readonly review = inject(PaymentReviewService);
  async verifyPay(b: BillingEvent) {
    if (await this.review.verify(b, this.draft?.name ?? 'The lab')) this.bills.set(await this.admin.billing(this.id()));
  }
  async rejectPay(b: BillingEvent) {
    if (await this.review.reject(b, this.draft?.name ?? 'The lab')) this.bills.set(await this.admin.billing(this.id()));
  }

  async markBill(b: BillingEvent, status: BillingEvent['status']) {
    await this.admin.setBillingStatus(b.id, status);
    this.bills.set(await this.admin.billing(this.id()));
  }

  /** Netlify domain status for the Domain tab */
  protected readonly domain = signal<{ state: 'checking' | 'live' | 'missing' | 'manual'; message?: string }>({ state: 'checking' });

  async checkDomain(slug: string) {
    this.domain.set({ state: 'checking' });
    const r = await this.admin.labDomain('status', slug);
    if (!r.ok) this.domain.set({ state: 'manual', message: r.message });
    else this.domain.set({ state: r.present ? 'live' : 'missing' });
  }

  async attachDomain() {
    if (!this.draft) return;
    this.domain.set({ state: 'checking' });
    const r = await this.admin.labDomain('add', this.draft.slug);
    if (r.ok) {
      this.toast.success('Subdomain attached — HTTPS is issued in a few minutes.');
      this.domain.set({ state: 'live' });
    } else {
      this.toast.warn(r.message ?? 'Could not attach the subdomain.');
      this.domain.set({ state: 'manual', message: r.message });
    }
  }

  async deleteLab() {
    if (!this.draft) return;
    const typed = await this.dialog.prompt({
      title: `Delete ${this.draft.name}?`,
      message: 'This permanently removes the lab and cannot be undone:',
      details: ['All patient visits and report PDFs', 'Branding, pages, tests and API keys', 'Lab admin and staff access to this lab'],
      label: `Type “${this.draft.slug}” to confirm`,
      placeholder: this.draft.slug,
      mono: true,
      requireMatch: this.draft.slug,
      confirmText: 'Delete lab',
      tone: 'danger',
      icon: 'trash-2',
    });
    if (typed !== this.draft.slug) return;
    try {
      const slug = this.draft.slug;
      await this.admin.deleteTenant(this.draft.id);
      await this.admin.labDomain('remove', slug);
      this.toast.success('Lab deleted');
      this.router.navigateByUrl('/admin/labs');
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async copy(text: string) {
    await navigator.clipboard.writeText(text);
    this.toast.success('Copied');
  }
}
