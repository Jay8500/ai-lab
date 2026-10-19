import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { FormField } from '../../shared/form-field';

interface PublicPlan {
  code: string;
  name: string;
  billing_model: string;
  price: number;
  per_report_fee: number;
  report_quota: number | null;
  setup_fee: number;
  features: Record<string, boolean>;
}

/** Public product page for SpreadApps AI-Lab (ailab.spreadapps.in). */
@Component({
  selector: 'app-sales',
  imports: [FormsModule, RouterLink, LucideAngularModule, FormField],
  templateUrl: './sales.html',
})
export class SalesPage implements OnInit {
  private readonly sb = inject(SupabaseService);
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);
  protected readonly brand = environment.brand;
  protected readonly year = new Date().getFullYear();

  protected readonly plans = signal<PublicPlan[]>([]);
  protected readonly menu = signal(false);
  protected readonly labPicker = signal(false);
  protected labSlug = '';

  // Demo form
  protected readonly lead = { name: '', lab: '', phone: '', city: '', email: '', message: '' };
  protected readonly sent = signal<string | null>(null);
  protected readonly sending = signal(false);
  private readonly submitted = signal(false);
  private readonly touched = signal<Record<string, boolean>>({});
  private readonly tick = signal(0);

  protected readonly features = [
    { icon: 'zap', title: 'Token in 5 seconds', text: 'Reception registers the patient, picks tests and generates a token — on the front-desk PC or a phone.' },
    { icon: 'flask-conical', title: 'Sample workflow', text: 'Collected → testing → verified → ready. Everyone sees where every sample is, live.' },
    { icon: 'microscope', title: 'Result entry & instant reports', text: 'Technicians type values with ranges and H/L flags; the pathologist verifies and the PDF report is created automatically.' },
    { icon: 'printer', title: 'Barcode tube labels', text: 'One label per tube from the patient card — the analyzer reads the token straight from the tube.' },
    { icon: 'send', title: 'Reports on WhatsApp', text: 'Drop the signed PDF on the patient card and share it on WhatsApp in one tap.' },
    { icon: 'smartphone', title: 'Patient tracking & history', text: 'Patients follow their sample live, download the official PDF and see all earlier visits — no login.' },
    { icon: 'globe', title: 'Your own branded website', text: 'yourlab.spreadapps.in with your logo, colours, cover page, tests & prices.' },
    { icon: 'list-todo', title: 'Tasks for the team', text: 'Assign work, set due times and priorities, and see what’s overdue at a glance.' },
    { icon: 'history', title: 'Activity timeline', text: 'Who registered, tested, uploaded and sent — every step recorded, newest first.' },
    { icon: 'shield-check', title: 'Security first', text: 'One active login per account, remote device sign-out, lab-only access, encrypted keys.' },
    { icon: 'users', title: 'Roles that fit a lab', text: 'Lab admin, receptionist, technician, pathologist — each sees only what they need.' },
    { icon: 'bell', title: 'Updates in the app', text: 'Important notices appear right inside the workspace, not lost in an inbox.' },
    { icon: 'life-buoy', title: 'Support built in', text: 'Raise a ticket with a screenshot from any page; we reply through Circles.' },
    { icon: 'monitor', title: 'Works everywhere', text: 'Install it like an app on Android, iPhone, Windows or Mac. No setup, no servers.' },
  ];

  protected readonly ai = [
    { icon: 'sparkles', title: 'AI report explainer', text: 'Plain-language summaries of results for patients the moment the report is uploaded, with a clear medical disclaimer.', live: true },
    { icon: 'chart-column', title: 'Trends across visits', text: 'See how a patient’s values change over time, highlighted automatically.', live: true },
    { icon: 'bot', title: 'Smart assistant for staff', text: 'Ask “which reports are pending since morning?” and get the answer instantly.', live: true },
    { icon: 'monitor', title: 'Analyzer interfacing', text: 'ASTM / HL7 machines send results straight in — set up per lab with your vendor.', live: false },
  ];

  protected readonly steps = [
    { icon: 'user-plus', title: 'Register', text: 'Name, mobile, tests → token printed or shared.' },
    { icon: 'flask-conical', title: 'Process', text: 'Start testing, verify results.' },
    { icon: 'file-check', title: 'Upload', text: 'Drop the signed PDF.' },
    { icon: 'send', title: 'Deliver', text: 'WhatsApp the link; patient tracks & downloads.' },
  ];

  protected readonly faqs = [
    { q: 'Do patients need to install anything or log in?', a: 'No. They open the link from WhatsApp or type their token on your website.' },
    { q: 'Can we keep our own lab brand?', a: 'Yes — your logo, colours, cover page and tests & prices on your own subdomain (custom domains on request).' },
    { q: 'Is patient data safe?', a: 'Data is encrypted in transit and at rest on servers in India. Each lab only ever sees its own data, and every action is recorded.' },
    { q: 'How long does setup take?', a: 'Usually the same day: we create your lab, you add your tests and staff, and reception can start.' },
    { q: 'Is there a free trial?', a: 'Yes. Every lab starts with a free trial; you choose a plan only when you are happy.' },
  ];

  protected readonly errors = computed(() => {
    this.tick();
    const e: Record<string, string> = {};
    const l = this.lead;
    if (l.name.trim().length < 2) e['name'] = 'Tell us your name.';
    if (l.lab.trim().length < 2) e['lab'] = 'Enter your lab’s name.';
    const ph = l.phone.replace(/[\s-]/g, '');
    if (!ph) e['phone'] = 'We’ll call or WhatsApp you on this number.';
    else if (!/^(\+?91)?[6-9]\d{9}$/.test(ph)) e['phone'] = 'Enter a 10-digit Indian mobile number, e.g. 98765 43210.';
    if (l.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email.trim())) e['email'] = 'That email doesn’t look right — or leave it empty.';
    return e;
  });

  async ngOnInit() {
    const { data } = await this.sb.client.rpc('public_plans');
    this.plans.set((data ?? []) as PublicPlan[]);
  }

  show(f: string): string | null {
    return this.submitted() || this.touched()[f] ? (this.errors()[f] ?? null) : null;
  }

  touch(f: string) {
    this.tick.update((n) => n + 1);
    this.touched.update((t) => ({ ...t, [f]: true }));
  }

  changed() {
    this.tick.update((n) => n + 1);
  }

  priceLabel(p: PublicPlan): { amount: string; unit: string } {
    const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
    switch (p.billing_model) {
      case 'monthly': return { amount: inr(p.price), unit: '/month' };
      case 'yearly': return { amount: inr(p.price), unit: '/year' };
      case 'per_report': return { amount: inr(p.per_report_fee), unit: '/report' };
      case 'hybrid': return { amount: inr(p.price), unit: `/month + ${inr(p.per_report_fee)}/report` };
      case 'free': return { amount: 'Free', unit: 'trial' };
      default: return { amount: inr(p.price), unit: '' };
    }
  }

  planPerks(p: PublicPlan): string[] {
    const out = [p.report_quota ? `${p.report_quota.toLocaleString('en-IN')} reports / month` : 'Unlimited reports'];
    if (p.features?.['whatsapp']) out.push('WhatsApp report sharing');
    if (p.features?.['ai_explain']) out.push('AI report explainer (when live)');
    if (p.features?.['circles']) out.push('Priority support');
    if (p.setup_fee) out.push(`₹${p.setup_fee.toLocaleString('en-IN')} one-time setup`);
    return out;
  }

  scrollTo(id: string, ev?: Event) {
    ev?.preventDefault();
    this.menu.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  goToLab() {
    const s = this.labSlug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(s)) return this.toast.warn('Enter your lab’s address, e.g. srisai-diagnostics.');
    location.href = this.tenant.labUrl(s, '/login');
  }

  async submit() {
    this.submitted.set(true);
    this.tick.update((n) => n + 1);
    const n = Object.keys(this.errors()).length;
    if (n) return this.toast.warn(n === 1 ? 'One field needs attention.' : `${n} fields need attention.`);
    this.sending.set(true);
    try {
      const l = this.lead;
      const { data, error } = await this.sb.client.rpc('submit_lead', {
        p_name: l.name, p_lab: l.lab, p_phone: l.phone, p_city: l.city, p_email: l.email, p_message: l.message,
      });
      if (error) throw error;
      this.sent.set(data as string);
      // Email the SpreadApps owner about the new request (best effort, never blocks the visitor)
      void this.sb.client.functions.invoke('lead-alert', { body: {} }).catch(() => undefined);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      this.toast.fail(/rate limit/i.test(msg) ? 'Too many requests' : e, 'Could not send your request — please WhatsApp or email us.');
    } finally {
      this.sending.set(false);
    }
  }
}
