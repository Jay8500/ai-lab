import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { CirclesLogo } from '../../shared/circles-logo';
import { AdminService } from '../../core/admin.service';
import { FormField } from '../../shared/form-field';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

interface CirclesSettings {
  enabled: boolean;
  api_url: string;
  project_id: string;
  note?: string;
}

interface EmailSettings {
  from_name: string;
  from_email: string;
  reply_to: string;
  footer: string;
}

interface BillingSettings {
  upi_id: string;
  payee_name: string;
  bank_details: string;
  grace_days: number;
  enforce: boolean;
}

interface BrandSettings {
  name: string;
  product: string;
  support_email: string;
  base_domain: string;
}

@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule, LucideAngularModule, CirclesLogo, FormField],
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Platform settings</h1>
    <p class="text-sm text-slate-500">Defaults for the whole AI-Lab platform.</p>

    <div class="mt-5 grid gap-5 lg:grid-cols-2">
      <form class="card space-y-4 p-5 sm:p-6" (ngSubmit)="saveCircles()">
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-slate-50 ring-1 ring-slate-100"><app-circles-logo [size]="24" /></span>
          <div><h2 class="section-title">Circles ticketing</h2><p class="text-xs text-slate-400">Where in-app support tickets are forwarded.</p></div>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" class="size-4 accent-[var(--brand)]" name="en" [(ngModel)]="circles.enabled" /> Show support widget to labs</label>
        <div><label class="label">Circles API / webhook URL</label><input class="input font-mono text-xs" name="u" [(ngModel)]="circles.api_url" placeholder="https://yytcmotbgccpbyvheakn.supabase.co/functions/v1/…" /></div>
        <div><label class="label">Default Circles project ID</label><input class="input font-mono text-xs" name="p" [(ngModel)]="circles.project_id" /></div>
        <p class="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          Tickets are always saved here first (Admin → Support). Per-lab Circles project/API keys live under each lab's <b>API keys</b> tab and override this default.
        </p>
        <button class="btn-primary" type="submit"><lucide-icon name="save" class="size-4" /> Save</button>
      </form>

      <form class="card space-y-4 p-5 sm:p-6" (ngSubmit)="saveEmail()" novalidate>
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><lucide-icon name="mail" class="size-5" /></span>
          <div><h2 class="section-title">Email sender (Resend)</h2><p class="text-xs text-slate-400">Used for announcements to your labs.</p></div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <app-field label="From name" required [error]="emailErr().from_name" hint="Shown as the sender, e.g. Spread Apps.">
            <input class="input" name="fn" [(ngModel)]="email.from_name" maxlength="60" />
          </app-field>
          <app-field label="From address" required [error]="emailErr().from_email" hint="Must be on your verified Resend domain (mail.spreadapps.in).">
            <input class="input" type="email" name="fe" [(ngModel)]="email.from_email" placeholder="updates@mail.spreadapps.in" />
          </app-field>
          <app-field label="Reply-to" optional [error]="emailErr().reply_to" hint="Where replies go.">
            <input class="input" type="email" name="rt" [(ngModel)]="email.reply_to" placeholder="support@spreadapps.in" />
          </app-field>
          <app-field label="Footer line" optional hint="Small print at the bottom of every email.">
            <input class="input" name="ft" [(ngModel)]="email.footer" maxlength="200" />
          </app-field>
        </div>
        <button class="btn-primary" type="submit"><lucide-icon name="save" class="size-4" /> Save</button>
      </form>

      <form class="card space-y-4 p-5 sm:p-6 lg:col-span-2" (ngSubmit)="saveBilling()" novalidate>
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><lucide-icon name="indian-rupee" class="size-5" /></span>
          <div><h2 class="section-title">Invoice payments</h2><p class="text-xs text-slate-400">How labs pay you. They scan a UPI QR (amount prefilled), then submit the UTR for you to confirm.</p></div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <app-field label="UPI ID" [required]="!billing.bank_details.trim()" [error]="billErr().upi_id" hint="Business / current-account UPI, e.g. spreadapps@okhdfcbank.">
            <input class="input font-mono" name="upi" [(ngModel)]="billing.upi_id" autocapitalize="none" spellcheck="false" placeholder="name@bank" />
          </app-field>
          <app-field label="Payee name" required [error]="billErr().payee_name" hint="Shown in the lab’s UPI app.">
            <input class="input" name="pn" [(ngModel)]="billing.payee_name" maxlength="50" />
          </app-field>
          <app-field label="Bank transfer details" optional class="sm:col-span-2" hint="Account name, number, IFSC, bank — shown under “Bank transfer”.">
            <textarea class="input min-h-24" name="bd" [(ngModel)]="billing.bank_details" maxlength="500" placeholder="A/c name: …&#10;A/c no: …&#10;IFSC: …&#10;Bank: …"></textarea>
          </app-field>
          <app-field label="Grace period (days)" required [error]="billErr().grace_days" hint="After the due date + this many days, an unpaid lab is paused.">
            <input class="input" type="number" name="gd" [(ngModel)]="billing.grace_days" min="0" max="60" />
          </app-field>
          <div class="flex items-end pb-6">
            <label class="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
              <input type="checkbox" class="mt-0.5 size-4 accent-[var(--brand)]" name="en" [(ngModel)]="billing.enforce" />
              <span><b class="block text-slate-700">Pause labs with overdue invoices</b><span class="text-xs text-slate-400">New patients & uploads stop; viewing and paying still work.</span></span>
            </label>
          </div>
        </div>
        <button class="btn-primary" type="submit"><lucide-icon name="save" class="size-4" /> Save</button>
      </form>

      <form class="card space-y-4 p-5 sm:p-6" (ngSubmit)="saveBrand()">
        <div class="flex items-center gap-3">
          <img [src]="logo" alt="" class="size-10" />
          <div><h2 class="section-title">Spread Apps brand</h2><p class="text-xs text-slate-400">Shown on the platform landing and “Powered by”.</p></div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label">Company</label><input class="input" name="n" [(ngModel)]="brand.name" /></div>
          <div><label class="label">Product</label><input class="input" name="p" [(ngModel)]="brand.product" /></div>
          <div><label class="label">Support email</label><input class="input" name="e" [(ngModel)]="brand.support_email" /></div>
          <div><label class="label">Base domain</label><input class="input font-mono" name="d" [(ngModel)]="brand.base_domain" /></div>
        </div>
        <button class="btn-primary" type="submit"><lucide-icon name="save" class="size-4" /> Save</button>
      </form>

      <form class="card space-y-4 p-5 sm:p-6" (ngSubmit)="changePw()">
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand"><lucide-icon name="lock" class="size-5" /></span>
          <div><h2 class="section-title">Your password</h2><p class="text-xs text-slate-400">Signed in as {{ auth.profile()?.username }}</p></div>
        </div>
        <input class="input" type="password" name="pw" [(ngModel)]="pw" placeholder="New password (8+ characters)" autocomplete="new-password" minlength="8" />
        <button class="btn-primary" type="submit"><lucide-icon name="key-round" class="size-4" /> Update password</button>
      </form>
    </div>
  `,
})
export class AdminSettings implements OnInit {
  private readonly admin = inject(AdminService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly logo = environment.brand.logo;
  protected circles: CirclesSettings = { enabled: true, api_url: '', project_id: '' };
  protected email: EmailSettings = { from_name: 'Spread Apps', from_email: 'updates@mail.spreadapps.in', reply_to: '', footer: '' };
  private emailSubmitted = false;

  /** Sender rules — the address must be a real email on a verified domain. */
  emailErr(): Partial<Record<keyof EmailSettings, string>> {
    if (!this.emailSubmitted) return {};
    const e: Partial<Record<keyof EmailSettings, string>> = {};
    const ok = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
    if (!this.email.from_name.trim()) e.from_name = 'Enter the sender name people will see in their inbox.';
    if (!this.email.from_email.trim()) e.from_email = 'Enter the address emails are sent from.';
    else if (!ok(this.email.from_email)) e.from_email = 'That address doesn’t look right — e.g. updates@mail.spreadapps.in.';
    if (this.email.reply_to.trim() && !ok(this.email.reply_to)) e.reply_to = 'Enter a valid reply-to address, or leave it empty.';
    return e;
  }

  async saveEmail() {
    this.emailSubmitted = true;
    if (Object.keys(this.emailErr()).length) return this.toast.warn('Fix the highlighted email settings.');
    await this.run(() => this.admin.saveSetting('email', this.email));
  }

  protected billing: BillingSettings = { upi_id: '', payee_name: 'Spread Apps', bank_details: '', grace_days: 7, enforce: true };
  private billSubmitted = false;

  billErr(): Partial<Record<keyof BillingSettings, string>> {
    if (!this.billSubmitted) return {};
    const e: Partial<Record<keyof BillingSettings, string>> = {};
    const upi = this.billing.upi_id.trim();
    if (!upi && !this.billing.bank_details.trim()) e.upi_id = 'Add a UPI ID or bank details so labs can pay.';
    else if (upi && !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(upi)) e.upi_id = 'That UPI ID doesn’t look right — it looks like name@bank.';
    if (!this.billing.payee_name.trim()) e.payee_name = 'Enter the name labs will see when paying.';
    const g = Number(this.billing.grace_days);
    if (!Number.isInteger(g) || g < 0 || g > 60) e.grace_days = 'Use a whole number from 0 to 60.';
    return e;
  }

  async saveBilling() {
    this.billSubmitted = true;
    if (Object.keys(this.billErr()).length) return this.toast.warn('Fix the highlighted payment settings.');
    await this.run(() => this.admin.saveSetting('billing', { ...this.billing, upi_id: this.billing.upi_id.trim(), grace_days: Number(this.billing.grace_days) }));
  }

  protected brand: BrandSettings = { name: 'Spread Apps', product: 'AI-Lab', support_email: '', base_domain: environment.baseDomain };
  protected pw = '';
  protected readonly loaded = signal(false);

  async ngOnInit() {
    this.circles = { ...this.circles, ...((await this.admin.setting<CirclesSettings>('circles')) ?? {}) };
    this.brand = { ...this.brand, ...((await this.admin.setting<BrandSettings>('brand')) ?? {}) };
    this.email = { ...this.email, ...((await this.admin.setting<EmailSettings>('email')) ?? {}) };
    this.billing = { ...this.billing, ...((await this.admin.setting<BillingSettings>('billing')) ?? {}) };
    this.loaded.set(true);
    this.cdr.markForCheck();
  }

  async saveCircles() {
    await this.run(() => this.admin.saveSetting('circles', this.circles));
  }

  async saveBrand() {
    await this.run(() => this.admin.saveSetting('brand', this.brand));
  }

  async changePw() {
    if (this.pw.length < 8) return this.toast.warn('Password must be at least 8 characters.');
    await this.run(() => this.auth.updatePassword(this.pw));
    this.pw = '';
  }

  private async run(fn: () => Promise<unknown>) {
    try {
      await fn();
      this.toast.success('Saved');
    } catch (e) {
      this.toast.fail(e);
    }
  }
}
