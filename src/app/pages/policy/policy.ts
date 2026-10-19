import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { TenantService } from '../../core/tenant.service';

/** Version stamped on each visit's consent; bump when the notice changes materially. */
export const CONSENT_VERSION = '2026-10-18';

interface Section {
  h: string;
  p?: string[];
  li?: string[];
}

/**
 * Privacy notice / Terms. On a lab's site the lab is the Data Fiduciary and Spread Apps its
 * Data Processor; on ailab.spreadapps.in Spread Apps speaks to labs as its customers.
 * Starting text aligned to India's DPDP Act 2023 — to be reviewed by a lawyer.
 */
@Component({
  selector: 'app-policy',
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="min-h-dvh bg-slate-50">
      <header class="border-b border-slate-100 bg-white">
        <div class="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <a routerLink="/" class="flex min-w-0 items-center gap-2.5">
            <img [src]="tenant.logo()" alt="" class="size-8 shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-100" />
            <span class="truncate font-bold text-slate-800">{{ org() }}</span>
          </a>
          <a routerLink="/" class="ml-auto text-sm font-semibold text-slate-500 hover:text-slate-800">← Back</a>
        </div>
      </header>
      <main class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p class="text-sm font-bold tracking-wider text-brand uppercase">{{ kind() === 'privacy' ? 'Privacy notice' : 'Terms of use' }}</p>
        <h1 class="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{{ kind() === 'privacy' ? 'How we protect your data' : 'Terms of use' }}</h1>
        <p class="mt-2 text-sm text-slate-500">Last updated {{ updated }}</p>

        <div class="mt-8 space-y-6">
          @for (s of sections(); track s.h) {
            <section class="card p-5 sm:p-6">
              <h2 class="font-bold text-slate-900">{{ s.h }}</h2>
              @for (p of s.p ?? []; track $index) { <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ p }}</p> }
              @if (s.li?.length) {
                <ul class="mt-2 space-y-1.5 text-sm text-slate-600">
                  @for (x of s.li; track $index) { <li class="flex gap-2"><lucide-icon name="check" class="mt-0.5 size-4 shrink-0 text-emerald-500" /> {{ x }}</li> }
                </ul>
              }
            </section>
          }
        </div>

        <p class="mt-8 text-center text-sm text-slate-500">
          <a routerLink="/privacy" class="font-semibold text-brand hover:underline">Privacy notice</a> ·
          <a routerLink="/terms" class="font-semibold text-brand hover:underline">Terms of use</a>
        </p>
      </main>
    </div>
  `,
})
export class PolicyPage {
  readonly kind = input<'privacy' | 'terms'>('privacy');
  protected readonly tenant = inject(TenantService);
  protected readonly updated = new Date(CONSENT_VERSION + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  protected readonly org = computed(() => this.tenant.tenant()?.name ?? `${environment.brand.name} ${environment.brand.product}`);

  private readonly grievance = computed(() => {
    const t = this.tenant.tenant();
    const p = (t?.pages ?? {}) as Record<string, string>;
    const name = p['grievance_name'] || (t ? `${t.name} Grievance Officer` : 'Spread Apps Grievance Officer');
    const contact = [p['grievance_email'] || t?.contact_email || environment.brand.supportEmail, p['grievance_phone'] || t?.contact_phone].filter(Boolean).join(' · ');
    return `${name} — ${contact}`;
  });

  protected readonly sections = computed<Section[]>(() => {
    const lab = this.tenant.tenant();
    const brand = `${environment.brand.name} ${environment.brand.product}`;
    if (this.kind() === 'terms') return lab ? this.labTerms(lab.name, brand) : this.platformTerms(brand);
    return lab ? this.labPrivacy(lab.name, brand) : this.platformPrivacy(brand);
  });

  private labPrivacy(lab: string, brand: string): Section[] {
    return [
      { h: 'Who we are', p: [`${lab} (“the lab”, “we”) collects and uses your personal data to run your tests and deliver your report. We are the Data Fiduciary under India’s Digital Personal Data Protection Act, 2023. We use ${brand}, provided by Spread Apps, as our software; Spread Apps processes data only on our instructions (Data Processor).`] },
      { h: 'What we collect', li: ['Name, age, sex and mobile number', 'Tests ordered, sample status and your report (PDF)', 'An AI-written plain-language explanation of your report, if the lab uses it', 'Basic technical data when you open the tracking page (browser, time)'] },
      { h: 'Why we use it', li: ['To register your visit, run your tests and give you your report', 'To send your report link by WhatsApp or SMS', 'To show your earlier visits at this lab so you can download past reports', 'To meet legal and medical record-keeping requirements'] },
      { h: 'Your consent', p: ['We ask for your consent when you register. For anyone under 18, a parent or guardian consents on their behalf. You can withdraw consent at any time by contacting the lab; this won’t affect tests already done, and some records may have to be kept by law.'] },
      { h: 'AI explanation', p: ['If the lab has turned it on, your report is sent securely to an AI service to write a simple explanation. It is for general understanding only — it is not a diagnosis. Always consult your doctor about your results.'] },
      { h: 'Who can see your data', li: ['Only authorised staff of this lab', 'Spread Apps, only to run and support the software', 'The AI provider chosen by the lab, only to write the explanation', 'Never sold, and never shared with other labs or advertisers'] },
      { h: 'How we protect it', li: ['Encrypted in transit (HTTPS) and at rest, on servers in India', 'Report links are unguessable; you only need your token', 'Staff accounts are lab-only, one active login at a time, with every action recorded'] },
      { h: 'How long we keep it', p: ['We keep your records as long as needed for your care and as required by law, and then delete them.'] },
      { h: 'Your rights', li: ['Access a summary of your data and how it is used', 'Correct or update wrong details', 'Ask us to erase data we no longer need to keep', 'Nominate someone to exercise these rights for you', 'Complain to us, and if not resolved, to the Data Protection Board of India'] },
      { h: 'Grievance officer', p: [this.grievance()] },
    ];
  }

  private labTerms(lab: string, brand: string): Section[] {
    return [
      { h: 'Using this site', p: [`This site is run by ${lab} using ${brand}. By using it you agree to these terms.`] },
      { h: 'Your report', p: ['The official report is the signed PDF issued by the lab. Keep your token and tracking link private — anyone who has them can open your report.'] },
      { h: 'AI explanation', p: ['Any AI explanation is for general information only and may contain mistakes. It does not replace advice from a qualified doctor.'] },
      { h: 'Not for emergencies', p: ['For medical emergencies contact a doctor or emergency services immediately.'] },
      { h: 'Contact', p: [this.grievance()] },
    ];
  }

  private platformPrivacy(brand: string): Section[] {
    return [
      { h: 'Who we are', p: [`Spread Apps provides ${brand}, software that diagnostic labs use to manage patients and deliver reports. For patient data, each lab is the Data Fiduciary and Spread Apps is its Data Processor, acting only on the lab’s instructions.`] },
      { h: 'Data we handle for labs', li: ['Lab account details: lab name, staff names, usernames, emails, phone numbers', 'Patient visit data the lab enters, reports it uploads, and AI explanations it requests', 'Usage and security logs (sign-ins, devices, actions) to keep accounts safe', 'Demo requests submitted on this site: name, lab, phone, city, email'] },
      { h: 'How we use it', li: ['To provide, secure and support the service', 'To bill labs for their plan and charges', 'To send service, billing and feature updates to lab admins', 'Never sold; never used for advertising'] },
      { h: 'Security', li: ['Encryption in transit and at rest; servers in India', 'Strict separation: each lab can only access its own data', 'One active login per account, remote device sign-out, encrypted API keys, full activity history'] },
      { h: 'Sub-processors', li: ['Supabase (database, storage, authentication)', 'Netlify (website hosting)', 'Resend (email delivery)', 'AI providers chosen by each lab with its own key (e.g. Anthropic)'] },
      { h: 'Retention & deletion', p: ['Lab data is kept while the lab’s account is active. When a lab leaves, we delete its data on request, subject to legal requirements.'] },
      { h: 'Your rights', p: ['Lab staff and demo-requesters can ask to access, correct or delete their data. Patients should contact their lab, which controls their records.'] },
      { h: 'Grievance officer', p: [this.grievance()] },
    ];
  }

  private platformTerms(brand: string): Section[] {
    return [
      { h: 'The service', p: [`${brand} is provided by Spread Apps to diagnostic labs on the plan and charges agreed with each lab.`] },
      { h: 'Lab responsibilities', li: ['Obtain patient consent and keep patient data accurate', 'Keep staff logins private and remove staff who leave', 'Use the AI explanation only as an aid; medical responsibility stays with the lab and doctors', 'Use your own AI and messaging keys within those providers’ terms'] },
      { h: 'Billing', p: ['Subscription, database & hosting, maintenance and other charges are invoiced with due dates. Unpaid accounts may be paused after notice.'] },
      { h: 'Availability', p: ['We work to keep the service available and secure, with planned maintenance announced in advance.'] },
      { h: 'Contact', p: [this.grievance()] },
    ];
  }
}
