import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService, BillingPayee } from '../core/admin.service';
import { BillingEvent, billingLabel } from '../core/models';
import { TenantService } from '../core/tenant.service';
import { ToastService } from '../core/toast.service';
import { FormField } from './form-field';
import { Modal } from './modal';
import { qrDataUrl } from '../core/qr';

type Method = 'upi' | 'bank' | 'cash' | 'cheque';

/**
 * Lab admin pays an invoice: UPI QR / app link (or bank transfer), then submits the
 * transaction reference. Spread Apps verifies it and marks the invoice paid.
 */
@Component({
  selector: 'app-pay-invoice-modal',
  imports: [Modal, FormsModule, LucideAngularModule, FormField, DatePipe],
  template: `
    <app-modal [title]="'Pay ₹' + amount()" [subtitle]="label() + (bill().period ? ' · ' + bill().period : '')" [width]="560" (closed)="closed.emit()">
      @if (!payee()) {
        <div class="grid place-items-center py-10 text-slate-400"><lucide-icon name="loader-circle" class="size-6 animate-spin" /></div>
      } @else {
        @if (bill().reject_reason) {
          <div class="mb-4 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-700">
            <lucide-icon name="triangle-alert" class="mt-0.5 size-4 shrink-0" />
            <span><b class="block">Your last payment couldn’t be confirmed</b>{{ bill().reject_reason }}</span>
          </div>
        }
        <!-- Step 1: pay -->
        <div class="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-400 uppercase"><span class="grid size-5 place-items-center rounded-full bg-brand text-[10px] text-white">1</span> Pay</div>
        @if (payee()!.upi_id) {
          <div class="mt-3 flex flex-col items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:items-start">
            @if (qr()) {
              <img [src]="qr()" alt="UPI QR code" class="size-40 shrink-0 rounded-xl bg-white p-2 ring-1 ring-slate-100" />
            } @else {
              <div class="grid size-40 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-100"><lucide-icon name="loader-circle" class="size-5 animate-spin text-slate-300" /></div>
            }
            <div class="min-w-0 flex-1 text-sm">
              <p class="font-semibold text-slate-700">Scan with any UPI app</p>
              <p class="mt-0.5 text-xs text-slate-500">GPay, PhonePe, Paytm, BHIM or your bank app. The amount is filled in for you.</p>
              <div class="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{{ payee()!.upi_id }}</span>
                <button type="button" class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" (click)="copy(payee()!.upi_id, 'UPI ID')" title="Copy UPI ID"><lucide-icon name="copy" class="size-3.5" /></button>
              </div>
              <p class="mt-1.5 text-xs text-slate-400">Payee: <b class="text-slate-600">{{ payee()!.payee_name }}</b></p>
              <a [href]="upiLink()" class="btn-primary mt-3 w-full sm:hidden"><lucide-icon name="smartphone" class="size-4" /> Open UPI app</a>
            </div>
          </div>
        }
        @if (payee()!.bank_details) {
          <details class="group mt-3 rounded-2xl border border-slate-100 px-4 py-3 text-sm" [open]="!payee()!.upi_id">
            <summary class="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-700">
              <lucide-icon name="landmark" class="size-4 text-slate-400" /> Bank transfer (NEFT / IMPS / RTGS)
              <lucide-icon name="chevron-right" class="ml-auto size-4 text-slate-400 transition group-open:rotate-90" />
            </summary>
            <pre class="mt-2 font-sans text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{{ payee()!.bank_details }}</pre>
            <button type="button" class="mt-2 text-xs font-semibold text-brand hover:underline" (click)="copy(payee()!.bank_details, 'Bank details')">Copy details</button>
          </details>
        }
        @if (!payee()!.upi_id && !payee()!.bank_details) {
          <p class="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-xs text-amber-700">Payment details haven’t been set up yet — contact {{ brandName }} for how to pay, then submit the reference below.</p>
        }

        <!-- Step 2: confirm -->
        <form class="mt-6 space-y-4" (ngSubmit)="submit()" novalidate>
          <div class="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-400 uppercase"><span class="grid size-5 place-items-center rounded-full bg-brand text-[10px] text-white">2</span> Tell us you’ve paid</div>
          <app-field label="Paid by" required>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              @for (m of methods; track m.v) {
                <button type="button" class="rounded-xl border px-3 py-2 text-xs font-semibold transition"
                        [class]="method() === m.v ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600 hover:border-slate-300'"
                        (click)="method.set(m.v)">{{ m.l }}</button>
              }
            </div>
          </app-field>
          <app-field [label]="refLabel()" required [error]="err().ref" [hint]="refHint()">
            <input class="input font-mono uppercase" name="ref" [(ngModel)]="ref" (blur)="touched.set(true)" autocomplete="off" spellcheck="false" maxlength="30"
                   [placeholder]="method() === 'upi' ? '12-digit UTR, e.g. 412345678901' : method() === 'bank' ? 'UTR / transaction ID' : method() === 'cheque' ? 'Cheque number' : 'Receipt number'" />
          </app-field>
          <app-field label="Note" optional hint="Anything we should know — e.g. paid from a different account.">
            <input class="input" name="note" [(ngModel)]="note" maxlength="300" />
          </app-field>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" class="btn-ghost" (click)="closed.emit()">Later</button>
            <button type="submit" class="btn-primary" [disabled]="busy()">
              <lucide-icon [name]="busy() ? 'loader-circle' : 'send'" class="size-4" [class.animate-spin]="busy()" /> Submit payment
            </button>
          </div>
          <p class="text-center text-xs text-slate-400">{{ brandName }} confirms payments within 1 working day{{ bill().due_date ? '. Due ' + (bill().due_date | date: 'MMM d, y') : '' }}.</p>
        </form>
      }
    </app-modal>
  `,
})
export class PayInvoiceModal {
  private readonly admin = inject(AdminService);
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);

  readonly bill = input.required<BillingEvent>();
  readonly closed = output<void>();
  readonly paid = output<void>();

  protected readonly brandName = 'Spread Apps';
  protected readonly payee = signal<BillingPayee | null>(null);
  protected readonly qr = signal('');
  protected readonly busy = signal(false);
  protected readonly touched = signal(false);
  protected readonly submitted = signal(false);
  protected readonly method = signal<Method>('upi');
  protected ref = '';
  protected note = '';
  protected readonly methods: { v: Method; l: string }[] = [
    { v: 'upi', l: 'UPI' },
    { v: 'bank', l: 'Bank transfer' },
    { v: 'cheque', l: 'Cheque' },
    { v: 'cash', l: 'Cash' },
  ];

  protected readonly label = computed(() => billingLabel(this.bill().kind));
  protected readonly amount = computed(() => Number(this.bill().amount).toLocaleString('en-IN'));
  protected readonly refLabel = computed(() => ({ upi: 'UPI transaction ID (UTR)', bank: 'Bank reference (UTR)', cheque: 'Cheque number', cash: 'Receipt number' })[this.method()]);
  protected readonly refHint = computed(() =>
    this.method() === 'upi' ? 'In your UPI app, open the payment → “UPI transaction ID” / “UTR” (12 digits).' : this.method() === 'bank' ? 'Shown in your bank’s transfer confirmation.' : 'So we can match your payment.',
  );

  /** upi://pay deep link — amount, payee and invoice note prefilled */
  protected readonly upiLink = computed(() => {
    const p = this.payee();
    if (!p?.upi_id) return '';
    const b = this.bill();
    const tn = `${this.tenant.slug() ?? 'lab'} ${b.period ?? ''} ${this.label()}`.replace(/\s+/g, ' ').trim().slice(0, 60);
    const q = new URLSearchParams({ pa: p.upi_id, pn: p.payee_name, am: Number(b.amount).toFixed(2), cu: 'INR', tn });
    return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
  });

  constructor() {
    this.admin.billingPayee().then((p) => this.payee.set(p ?? { upi_id: '', payee_name: 'Spread Apps', bank_details: '', grace_days: 7 }));
    effect(() => {
      const link = this.upiLink();
      if (!link) return;
      qrDataUrl(link, { margin: 1, width: 320, errorCorrectionLevel: 'M' }).then((d) => this.qr.set(d)).catch(() => undefined);
    });
  }

  err(): { ref?: string } {
    if (!this.touched() && !this.submitted()) return {};
    const r = this.ref.trim();
    if (!r) return { ref: this.method() === 'upi' ? 'Enter the UPI transaction ID from your payment app.' : 'Enter the reference so we can match your payment.' };
    if (this.method() === 'upi' && !/^\d{12}$/.test(r)) return { ref: 'A UPI transaction ID (UTR) is 12 digits — check your UPI app.' };
    if (!/^[A-Za-z0-9/-]{6,30}$/.test(r)) return { ref: 'Use 6–30 letters or numbers (no spaces).' };
    return {};
  }

  async copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(`${what} copied`);
    } catch {
      this.toast.warn('Couldn’t copy — select and copy it manually.');
    }
  }

  async submit() {
    this.submitted.set(true);
    if (this.err().ref) return this.toast.warn('Check the payment reference.');
    this.busy.set(true);
    try {
      await this.admin.submitPayment(this.bill().id, this.ref.trim(), this.method(), this.note);
      this.toast.success('Payment submitted — we’ll confirm it shortly.');
      this.paid.emit();
    } catch (e) {
      this.toast.fail(e, 'Could not submit the payment.');
    } finally {
      this.busy.set(false);
    }
  }
}
