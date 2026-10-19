import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Booking, BookingsService } from '../../core/bookings.service';
import { DialogService } from '../../core/dialog.service';
import { LabService } from '../../core/lab.service';
import { ReceiptService } from '../../core/receipt.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

const SLOT: Record<string, string> = { morning: 'Morning (7–11 am)', afternoon: 'Afternoon (11–3)', evening: 'Evening (3–8 pm)' };

/** Online booking requests from the lab's website: confirm, cancel, or register as a visit. */
@Component({
  selector: 'app-lab-bookings',
  imports: [LucideAngularModule, DatePipe, RouterLink],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Bookings</h1>
        <p class="text-sm text-slate-500">Requests from your website — call the patient, confirm, then register them when they arrive.</p>
      </div>
      <a [href]="bookUrl()" target="_blank" rel="noopener" class="btn-ghost py-2! text-xs"><lucide-icon name="external-link" class="size-3.5" /> Open booking page</a>
    </div>

    <div class="mt-5 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold sm:w-fit">
      @for (t of tabs; track t.k) {
        <button class="rounded-lg px-4 py-1.5 transition" [class]="tab() === t.k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="tab.set(t.k)">
          {{ t.l }} @if (count(t.k)) { <span class="ml-1 rounded-full bg-brand/10 px-1.5 text-xs text-brand">{{ count(t.k) }}</span> }
        </button>
      }
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      @for (b of shown(); track b.id) {
        <article class="card flex flex-col p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-mono text-[11px] font-bold text-brand">{{ b.ref }} · {{ b.created_at | date: 'MMM d, h:mm a' }}</p>
              <h3 class="truncate text-base font-bold text-slate-800">{{ b.patient_name }}</h3>
              <p class="text-xs text-slate-500">{{ b.age ?? '—' }} yrs · {{ b.gender ?? '—' }} · {{ b.mobile }}{{ b.email ? ' · ' + b.email : '' }}</p>
            </div>
            <span class="pill shrink-0" [class]="tone(b.status)">{{ label(b.status) }}</span>
          </div>
          <div class="mt-3 space-y-1.5 text-sm text-slate-600">
            <p class="flex items-center gap-2"><lucide-icon name="calendar" class="size-4 text-slate-400" /> {{ b.preferred_date | date: 'EEE, MMM d' }} · {{ slot(b.slot) }}</p>
            <p class="flex items-start gap-2"><lucide-icon [name]="b.collection === 'home' ? 'house' : 'map-pin'" class="mt-0.5 size-4 text-slate-400" />
              {{ b.collection === 'home' ? 'Home collection — ' + b.address : 'Visits the lab' }}</p>
            @if (b.notes) { <p class="flex items-start gap-2"><lucide-icon name="message-square-text" class="mt-0.5 size-4 text-slate-400" /> {{ b.notes }}</p> }
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            @for (t of b.tests; track t.code) { <span class="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100">{{ t.code }} · ₹{{ t.price }}</span> }
            @if (!b.tests.length) { <span class="text-xs text-amber-600">Tests not chosen — see prescription</span> }
            @if (b.amount) { <span class="ml-auto text-sm font-bold text-slate-700">₹{{ b.amount.toLocaleString('en-IN') }}</span> }
          </div>
          @if (b.status_note) { <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Note: {{ b.status_note }}</p> }
          <div class="mt-auto flex flex-wrap gap-2 pt-4">
            <a class="btn-ghost px-3! py-1.5! text-xs" [href]="'tel:' + b.mobile"><lucide-icon name="phone" class="size-3.5" /> Call</a>
            <a class="btn-ghost px-3! py-1.5! text-xs" [href]="wa(b)" target="_blank" rel="noopener"><lucide-icon name="message-circle" class="size-3.5" /> WhatsApp</a>
            @if (b.prescription_path) {
              <button class="btn-ghost px-3! py-1.5! text-xs" (click)="openRx(b)"><lucide-icon name="file-text" class="size-3.5" /> Prescription</button>
            }
            @if (b.status === 'requested') {
              <button class="btn-ghost px-3! py-1.5! text-xs text-rose-600!" (click)="cancel(b)">Cancel</button>
              <button class="btn-primary px-3! py-1.5! text-xs" (click)="confirm(b)"><lucide-icon name="check" class="size-3.5" /> Confirm</button>
            } @else if (b.status === 'confirmed') {
              <button class="btn-ghost px-3! py-1.5! text-xs text-rose-600!" (click)="cancel(b)">Cancel</button>
              <button class="btn-primary bg-emerald-600! px-3! py-1.5! text-xs hover:bg-emerald-700!" (click)="register(b)" [disabled]="busy() === b.id">
                <lucide-icon [name]="busy() === b.id ? 'loader-circle' : 'user-plus'" class="size-3.5" [class.animate-spin]="busy() === b.id" /> Patient arrived · register
              </button>
            } @else if (b.status === 'completed' && b.visit_id) {
              <a class="btn-ghost px-3! py-1.5! text-xs" routerLink="/lab/results" [queryParams]="{ visit: b.visit_id }"><lucide-icon name="microscope" class="size-3.5" /> Open visit</a>
            }
          </div>
        </article>
      } @empty {
        <div class="card p-10 text-center text-sm text-slate-400 lg:col-span-2">
          <lucide-icon name="calendar-clock" class="mx-auto size-8 text-slate-300" />
          <p class="mt-2">{{ tab() === 'requested' ? 'No new requests. Share your booking page with patients.' : 'Nothing here yet.' }}</p>
        </div>
      }
    </div>
  `,
})
export class LabBookings {
  protected readonly bookings = inject(BookingsService);
  private readonly lab = inject(LabService);
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly receipt = inject(ReceiptService);

  protected readonly tabs = [
    { k: 'requested', l: 'New' },
    { k: 'confirmed', l: 'Confirmed' },
    { k: 'done', l: 'Done & cancelled' },
  ] as const;
  protected readonly tab = signal<'requested' | 'confirmed' | 'done'>('requested');
  protected readonly busy = signal<string | null>(null);
  protected readonly shown = computed(() => {
    const t = this.tab();
    return this.bookings.list().filter((b) => (t === 'done' ? b.status === 'completed' || b.status === 'cancelled' : b.status === t));
  });
  protected readonly bookUrl = computed(() => this.tenant.labUrl(this.tenant.slug() ?? '', '/book'));

  count(k: string) {
    return this.bookings.list().filter((b) => (k === 'done' ? false : b.status === k)).length;
  }
  slot(s: string) {
    return SLOT[s] ?? s;
  }
  label(s: string) {
    return { requested: 'New', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Registered' }[s] ?? s;
  }
  tone(s: string) {
    return s === 'requested' ? 'border-amber-100 bg-amber-50 text-amber-600' : s === 'confirmed' ? 'border-sky-100 bg-sky-50 text-sky-600' : s === 'completed' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-rose-100 bg-rose-50 text-rose-600';
  }
  wa(b: Booking) {
    const date = new Date(b.preferred_date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const msg = `Hello ${b.patient_name}, this is ${this.tenant.name()} about your booking ${b.ref} for ${date} (${this.slot(b.slot)}).`;
    return `https://wa.me/91${b.mobile}?text=${encodeURIComponent(msg)}`;
  }

  async openRx(b: Booking) {
    const url = await this.bookings.prescriptionUrl(b.prescription_path!);
    if (url) window.open(url, '_blank', 'noopener');
    else this.toast.warn('Could not open the prescription.');
  }

  async confirm(b: Booking) {
    const note = await this.dialog.prompt({
      title: 'Confirm this booking?',
      message: 'Confirm after you have spoken to the patient. They see this status when they check the booking.',
      label: 'Note for the patient (optional)',
      placeholder: 'e.g. Come fasting, 8 am',
      confirmText: 'Confirm booking',
      tone: 'success',
    });
    if (note === null) return;
    try {
      await this.bookings.setStatus(b, 'confirmed', note);
      this.toast.success(`${b.ref} confirmed.`);
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async cancel(b: Booking) {
    const reason = await this.dialog.prompt({
      title: 'Cancel this booking?',
      label: 'Reason (shown to the patient)',
      value: 'Could not reach you — please call the lab to book again.',
      confirmText: 'Cancel booking',
      tone: 'danger',
      validate: (v) => (v.trim().length < 5 ? 'Give a short reason.' : null),
    });
    if (reason === null) return;
    try {
      await this.bookings.setStatus(b, 'cancelled', reason);
      this.toast.info(`${b.ref} cancelled.`);
    } catch (e) {
      this.toast.fail(e);
    }
  }

  /** Patient arrived: create the visit (token) from the booking; tests can still be edited on the card. */
  async register(b: Booking) {
    if (!b.tests.length) return this.toast.warn('Choose the tests first: register from the dashboard (New patient) using the prescription.');
    const ok = await this.dialog.confirm({
      title: `Register ${b.patient_name}?`,
      message: 'Creates the visit and token with these tests. You can add or remove tests on the patient card afterwards.',
      details: b.tests.map((t) => `${t.name} — ₹${t.price}`),
      confirmText: 'Register & get token',
      tone: 'success',
    });
    if (!ok) return;
    this.busy.set(b.id);
    try {
      const v = await this.lab.add({
        patient_name: b.patient_name, mobile: b.mobile, age: b.age, gender: b.gender,
        tests: b.tests.map((t) => ({ code: t.code, name: t.name, price: Number(t.price) })),
        consent_at: b.consent_at, consent_by: b.age !== null && b.age < 18 ? 'guardian' : 'patient', consent_version: b.consent_version,
      });
      await this.bookings.setStatus(b, 'completed', b.status_note, v.id);
      this.toast.success(`Registered · token ${v.token}`);
      void this.receipt.print(v);
    } catch (e) {
      this.toast.fail(e, 'Could not register the patient.');
    } finally {
      this.busy.set(null);
    }
  }
}
