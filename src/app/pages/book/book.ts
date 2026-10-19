import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TestItem } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { BrandMark } from '../../shared/brand-mark';
import { FormField } from '../../shared/form-field';
import { CONSENT_VERSION } from '../policy/policy';

type Slot = 'morning' | 'afternoon' | 'evening';
type BookField = 'tests' | 'name' | 'mobile' | 'email' | 'age' | 'gender' | 'date' | 'address' | 'consent';
interface BookingStatus {
  ref: string;
  status: 'requested' | 'confirmed' | 'cancelled' | 'completed';
  status_note: string | null;
  preferred_date: string;
  slot: Slot;
  collection: 'lab' | 'home';
  tests: { code: string; name: string; price: number }[];
  amount: number;
  token: string | null;
  key: string | null;
}

const SLOTS: { v: Slot; l: string; h: string }[] = [
  { v: 'morning', l: 'Morning', h: '7 – 11 am' },
  { v: 'afternoon', l: 'Afternoon', h: '11 am – 3 pm' },
  { v: 'evening', l: 'Evening', h: '3 – 8 pm' },
];
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Patient books tests online (no login): choose tests or upload the prescription, pick a time, the lab confirms. */
@Component({
  selector: 'app-book',
  imports: [FormsModule, LucideAngularModule, RouterLink, DatePipe, FormField, BrandMark],
  template: `
    <div class="min-h-dvh bg-slate-50">
      <header class="relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-brand via-brand/90 to-accent"></div>
        <div class="relative mx-auto flex max-w-3xl items-center gap-3 px-4 pt-6 pb-20 text-white">
          <a routerLink="/" class="flex min-w-0 items-center gap-3">
            <img [src]="tenant.logo()" alt="" class="size-11 shrink-0 rounded-xl bg-white object-contain p-1" />
            <div class="min-w-0"><p class="truncate text-lg font-bold">{{ tenant.name() }}</p><p class="truncate text-xs text-white/75">Book a test online</p></div>
          </a>
        </div>
      </header>

      <main class="relative mx-auto -mt-14 max-w-3xl space-y-4 px-4 pb-12">
        @if (!open()) {
          <div class="card p-6 text-center text-sm text-slate-500">Online booking isn’t available for this lab right now. Please call or visit the lab.</div>
        } @else if (done(); as d) {
          <!-- Success -->
          <section class="card animate-fade-up p-6 text-center">
            <span class="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><lucide-icon name="badge-check" class="size-7" /></span>
            <h1 class="mt-3 text-xl font-bold text-slate-800">Booking request sent</h1>
            <p class="mt-1 text-sm text-slate-500">{{ tenant.name() }} will call you to confirm. Keep this reference:</p>
            <p class="mt-3 font-mono text-3xl font-extrabold tracking-wider text-brand">{{ d }}</p>
            <p class="mt-3 text-xs text-slate-400">Check its status any time below with this reference and the last 4 digits of your mobile.</p>
            <button class="btn-ghost mt-5" (click)="reset()"><lucide-icon name="plus" class="size-4" /> Book for someone else</button>
          </section>
        } @else {
          <form class="space-y-4" (ngSubmit)="submit()" novalidate>
            @let e = errs();
            <!-- 1 · Tests -->
            <section class="card p-5 sm:p-6">
              <h2 class="flex items-center gap-2 font-bold text-slate-800"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">1</span> Choose tests</h2>
              <p class="mt-1 text-xs text-slate-500">Tick the tests on your doctor’s prescription — or just upload the prescription and the lab will pick them.</p>
              <input class="input mt-3 py-2!" placeholder="Search tests…" [ngModel]="q()" (ngModelChange)="q.set($event)" name="q" />
              <div class="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                @for (t of shown(); track t.code) {
                  <button type="button" (click)="toggle(t)" class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
                          [class]="has(t.code) ? 'border-brand bg-brand/5 ring-2 ring-brand/10' : 'border-slate-200 hover:border-slate-300'">
                    <span class="grid size-5 shrink-0 place-items-center rounded-md border" [class]="has(t.code) ? 'border-brand bg-brand text-white' : 'border-slate-300'">
                      @if (has(t.code)) { <lucide-icon name="check" class="size-3.5" /> }
                    </span>
                    <span class="min-w-0 flex-1"><b class="block truncate text-sm text-slate-700">{{ t.name }}</b><span class="text-[11px] text-slate-400">{{ t.code }}@if (t.tat_hours) { · report in ~{{ t.tat_hours }}h }</span></span>
                    <span class="text-sm font-semibold text-slate-700">₹{{ t.price }}</span>
                  </button>
                } @empty {
                  <p class="py-6 text-center text-sm text-slate-400 sm:col-span-2">No tests match.</p>
                }
              </div>

              <div class="mt-4" [class.field-invalid]="!!e.tests">
                <label class="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3.5 py-3 transition hover:border-slate-300" [class]="file() ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'">
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="sr-only" (change)="pick($event)" />
                  <lucide-icon [name]="file() ? 'file-check' : 'image'" class="size-5 text-slate-400" />
                  <span class="min-w-0 flex-1 text-sm">
                    <b class="block text-slate-700">{{ file() ? file()!.name : 'Upload prescription (optional)' }}</b>
                    <span class="text-xs text-slate-400">Photo or PDF, up to 5 MB · only the lab can see it</span>
                  </span>
                  @if (file()) { <button type="button" class="text-xs font-semibold text-rose-600" (click)="$event.preventDefault(); file.set(null)">Remove</button> }
                </label>
                @if (e.tests) { <p class="mt-1.5 text-xs font-medium text-rose-600">{{ e.tests }}</p> }
              </div>
              @if (picked().length) {
                <p class="mt-3 text-right text-sm text-slate-600">{{ picked().length }} test(s) · <b class="text-lg text-slate-900">₹{{ total().toLocaleString('en-IN') }}</b> <span class="text-xs text-slate-400">pay at the lab</span></p>
              }
            </section>

            <!-- 2 · Patient -->
            <section class="card p-5 sm:p-6">
              <h2 class="flex items-center gap-2 font-bold text-slate-800"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">2</span> Patient details</h2>
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <app-field label="Full name" required [error]="e.name" class="sm:col-span-2"><input class="input" name="n" [(ngModel)]="name" maxlength="80" autocomplete="name" /></app-field>
                <app-field label="Mobile number" required [error]="e.mobile" hint="The lab calls this number to confirm."><input class="input" name="m" [(ngModel)]="mobile" inputmode="tel" maxlength="14" autocomplete="tel" placeholder="98765 43210" /></app-field>
                <app-field label="Email" optional [error]="e.email"><input class="input" type="email" name="em" [(ngModel)]="email" autocomplete="email" /></app-field>
                <app-field label="Age" optional [error]="e.age"><input class="input" type="number" name="a" [(ngModel)]="age" min="0" max="120" /></app-field>
                <app-field label="Gender" required [error]="e.gender">
                  <div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                    @for (g of genders; track g.v) {
                      <button type="button" class="rounded-lg py-1.5 text-xs font-semibold transition" [class]="gender() === g.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="gender.set(g.v)">{{ g.l }}</button>
                    }
                  </div>
                </app-field>
              </div>
            </section>

            <!-- 3 · When & where -->
            <section class="card p-5 sm:p-6">
              <h2 class="flex items-center gap-2 font-bold text-slate-800"><span class="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">3</span> When & where</h2>
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <app-field label="Preferred date" required [error]="e.date"><input class="input" type="date" name="d" [(ngModel)]="date" [min]="today" [max]="maxDate" /></app-field>
                <app-field label="Time" required>
                  <div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                    @for (s of slots; track s.v) {
                      <button type="button" class="rounded-lg px-1 py-1.5 text-xs font-semibold transition" [class]="slot() === s.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="slot.set(s.v)" [title]="s.h">{{ s.l }}</button>
                    }
                  </div>
                </app-field>
                @if (home()) {
                  <app-field label="Collection" required class="sm:col-span-2">
                    <div class="grid grid-cols-2 gap-2">
                      @for (c of [{ v: 'lab', l: 'I’ll visit the lab', i: 'map-pin' }, { v: 'home', l: 'Home sample collection', i: 'house' }]; track c.v) {
                        <button type="button" class="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition"
                                [class]="collection() === c.v ? 'border-brand bg-brand/5 text-brand' : 'border-slate-200 text-slate-600'" (click)="collection.set($any(c.v))">
                          <lucide-icon [name]="c.i" class="size-4" /> {{ c.l }}
                        </button>
                      }
                    </div>
                  </app-field>
                  @if (collection() === 'home') {
                    <app-field label="Address for collection" required [error]="e.address" class="sm:col-span-2">
                      <textarea class="input min-h-20" name="ad" [(ngModel)]="address" maxlength="300" autocomplete="street-address"></textarea>
                    </app-field>
                  }
                }
                <app-field label="Note for the lab" optional class="sm:col-span-2"><input class="input" name="no" [(ngModel)]="notes" maxlength="500" placeholder="e.g. fasting since 9 pm, diabetic" /></app-field>
              </div>
            </section>

            <!-- Consent + submit -->
            <section class="card space-y-4 p-5 sm:p-6">
              <!-- Spam trap: people never see or fill this -->
              <input class="hidden" name="website" [(ngModel)]="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
              <div [class.field-invalid]="!!e.consent">
                <label class="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed" [class]="e.consent ? 'border-rose-200 bg-rose-50/40' : consent() ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'">
                  <input type="checkbox" class="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" [checked]="consent()" (change)="consent.set(!consent())" />
                  <span class="text-slate-600"><b>I agree <span class="text-rose-500">*</span></b> that {{ tenant.name() }} may use these details{{ file() ? ' and my prescription' : '' }} to book and run my tests, as described in the
                    <a routerLink="/privacy" target="_blank" class="font-semibold text-brand hover:underline">privacy notice</a>.</span>
                </label>
                @if (e.consent) { <p class="mt-1.5 text-xs font-medium text-rose-600">{{ e.consent }}</p> }
              </div>
              <button class="btn-primary w-full py-3! text-base" type="submit" [disabled]="busy()">
                <lucide-icon [name]="busy() ? 'loader-circle' : 'calendar-clock'" class="size-5" [class.animate-spin]="busy()" /> Request booking
              </button>
              <p class="text-center text-xs text-slate-400">No payment now — pay at the lab. The lab confirms your slot by phone.</p>
            </section>
          </form>
        }

        <!-- Check a booking -->
        @if (open()) {
          <section class="card p-5 sm:p-6">
            <h2 class="font-bold text-slate-800">Check my booking</h2>
            <form class="mt-3 flex flex-wrap gap-2" (ngSubmit)="check()">
              <input class="input min-w-0 flex-1 font-mono uppercase" name="ref" [(ngModel)]="ref" placeholder="BK-XXXXXX" maxlength="9" autocomplete="off" />
              <input class="input w-28 text-center font-mono" name="l4" [(ngModel)]="refLast4" placeholder="Mobile ••••" inputmode="numeric" maxlength="4" autocomplete="off" />
              <button class="btn-ghost" type="submit" [disabled]="checking()">Check</button>
            </form>
            @if (status(); as s) {
              <div class="mt-4 rounded-xl border border-slate-100 p-4 text-sm">
                <p class="flex items-center gap-2"><b class="font-mono text-slate-800">{{ s.ref }}</b>
                  <span class="pill" [class]="tone(s.status)">{{ label(s.status) }}</span></p>
                <p class="mt-1 text-xs text-slate-500">{{ s.preferred_date | date: 'EEE, MMM d' }} · {{ s.slot }} · {{ s.collection === 'home' ? 'home collection' : 'at the lab' }}{{ s.amount ? ' · ₹' + s.amount : '' }}</p>
                @if (s.tests.length) { <p class="mt-1 text-xs text-slate-500">{{ testNames(s) }}</p> }
                @if (s.status_note) { <p class="mt-2 text-xs text-slate-600">Lab: “{{ s.status_note }}”</p> }
                @if (s.token && s.key) {
                  <a class="btn-primary mt-3 py-2! text-xs" [routerLink]="['/track', s.token]" [queryParams]="{ k: s.key }"><lucide-icon name="file-text" class="size-3.5" /> Track your sample · {{ s.token }}</a>
                }
              </div>
            }
          </section>
        }
        @if (tenant.pages().show_powered_by !== false) { <div class="flex justify-center pt-2"><app-brand-mark /></div> }
      </main>
    </div>
  `,
})
export class BookPage {
  protected readonly tenant = inject(TenantService);
  private readonly sb = inject(SupabaseService);
  private readonly toast = inject(ToastService);

  protected readonly slots = SLOTS;
  protected readonly genders = [{ v: 'M', l: 'Male' }, { v: 'F', l: 'Female' }, { v: 'O', l: 'Other' }] as const;
  protected readonly today = iso(new Date());
  protected readonly maxDate = iso(new Date(Date.now() + 60 * 86400000));

  protected readonly open = computed(() => !!this.tenant.tenant()?.usable && this.tenant.pages().show_booking !== false);
  protected readonly home = computed(() => this.tenant.pages().home_collection === true);
  protected readonly q = signal('');
  protected readonly picked = signal<TestItem[]>([]);
  protected readonly file = signal<File | null>(null);
  protected readonly gender = signal<'M' | 'F' | 'O' | null>(null);
  protected readonly slot = signal<Slot>('morning');
  protected readonly collection = signal<'lab' | 'home'>('lab');
  protected readonly consent = signal(false);
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);
  protected readonly done = signal<string | null>(null);
  protected name = '';
  protected mobile = '';
  protected email = '';
  protected age: number | null = null;
  protected date = iso(new Date(Date.now() + 86400000));
  protected address = '';
  protected notes = '';
  protected website = '';
  private readonly openedAt = Date.now();

  protected ref = '';
  protected refLast4 = '';
  protected readonly checking = signal(false);
  protected readonly status = signal<BookingStatus | null>(null);

  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.tenant.tenant()?.test_catalog ?? []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q));
  });
  protected readonly total = computed(() => this.picked().reduce((s, t) => s + Number(t.price || 0), 0));

  has(code: string) {
    return this.picked().some((t) => t.code === code);
  }
  toggle(t: TestItem) {
    this.picked.update((p) => (p.some((x) => x.code === t.code) ? p.filter((x) => x.code !== t.code) : [...p, t]));
  }
  pick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) return this.toast.warn('Use a photo (JPG / PNG) or a PDF.');
    if (f.size > 5 * 1024 * 1024) return this.toast.warn('The file must be under 5 MB.');
    this.file.set(f);
  }

  errs(): Partial<Record<BookField, string>> {
    if (!this.submitted()) return {};
    const e: Partial<Record<BookField, string>> = {};
    const name = this.name.replace(/\s+/g, ' ').trim();
    const mob = this.mobile.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!this.picked().length && !this.file()) e.tests = 'Choose at least one test, or upload the prescription.';
    if (!name) e.name = 'Enter the patient’s name.';
    else if (name.length < 2 || !/^[\p{L}][\p{L}\p{M} .'()-]*$/u.test(name)) e.name = 'Use letters only, e.g. Ravi Kumar.';
    if (!mob) e.mobile = 'Enter a mobile number so the lab can confirm.';
    else if (!/^[6-9]\d{9}$/.test(mob)) e.mobile = 'Enter a 10-digit Indian mobile number.';
    if (this.email.trim() && !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(this.email.trim())) e.email = 'That email doesn’t look right.';
    if (this.age !== null && (this.age as unknown) !== '' && !(Number(this.age) >= 0 && Number(this.age) <= 120 && Number.isInteger(Number(this.age)))) e.age = 'Age in years, 0 to 120.';
    if (!this.gender()) e.gender = 'Choose one.';
    if (!this.date || this.date < this.today || this.date > this.maxDate) e.date = 'Pick a date within the next 60 days.';
    if (this.collection() === 'home' && this.address.trim().length < 10) e.address = 'Enter the full address with landmark.';
    if (!this.consent()) e.consent = 'Please agree so the lab can use your details.';
    return e;
  }

  async submit() {
    this.submitted.set(true);
    if (Object.keys(this.errs()).length) return this.toast.warn('Please check the highlighted details.');
    // Bots fill hidden fields or submit instantly — accept silently, send nothing
    if (this.website || Date.now() - this.openedAt < 4000) {
      this.done.set('BK-' + Math.random().toString(16).slice(2, 8).toUpperCase());
      return;
    }
    const t = this.tenant.tenant();
    if (!t) return;
    this.busy.set(true);
    try {
      let rx: string | null = null;
      const f = this.file();
      if (f) {
        const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
        rx = `${t.id}/${crypto.randomUUID()}.${ext}`;
        const up = await this.sb.client.storage.from('prescriptions').upload(rx, f, { contentType: f.type, upsert: false });
        if (up.error) throw new Error('Could not upload the prescription — try a smaller photo.');
      }
      const { data, error } = await this.sb.client.rpc('submit_booking', {
        p_slug: t.slug, p_name: this.name.replace(/\s+/g, ' ').trim(), p_mobile: this.mobile, p_age: this.age === null || (this.age as unknown) === '' ? null : Number(this.age),
        p_gender: this.gender(), p_tests: this.picked().map((x) => x.code), p_date: this.date, p_slot: this.slot(), p_collection: this.collection(),
        p_address: this.collection() === 'home' ? this.address : null, p_notes: this.notes, p_prescription: rx, p_consent_version: CONSENT_VERSION,
        p_email: this.email.trim() || null,
      });
      if (error) throw error;
      this.done.set(data as string);
      this.ref = data as string;
    } catch (e) {
      const m = (e as Error).message ?? '';
      this.toast.fail(e, /rate limit/.test(m) ? 'Too many requests from this number today — please call the lab.' : /not open/.test(m) ? 'Online booking is closed for this lab.' : 'Could not send the booking. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  reset() {
    this.done.set(null);
    this.submitted.set(false);
    this.picked.set([]);
    this.file.set(null);
    this.name = this.mobile = this.email = this.address = this.notes = '';
    this.age = null;
    this.gender.set(null);
    this.consent.set(false);
  }

  async check() {
    const slug = this.tenant.slug();
    if (!slug || !/^BK-[0-9A-F]{6}$/i.test(this.ref.trim()) || !/^\d{4}$/.test(this.refLast4.trim())) {
      return this.toast.warn('Enter the booking reference (BK-…) and the last 4 digits of your mobile.');
    }
    this.checking.set(true);
    const { data } = await this.sb.client.rpc('booking_status', { p_slug: slug, p_ref: this.ref.trim(), p_last4: this.refLast4.trim() });
    this.checking.set(false);
    if (data?.blocked) return this.toast.warn('Too many tries — please wait 15 minutes.');
    if (!data) return this.toast.warn('No booking found with that reference and mobile.');
    this.status.set(data as BookingStatus);
  }

  label(s: string) {
    return { requested: 'Waiting for the lab', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Sample registered' }[s] ?? s;
  }
  tone(s: string) {
    return s === 'confirmed' || s === 'completed' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : s === 'cancelled' ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-amber-100 bg-amber-50 text-amber-600';
  }
  testNames(s: BookingStatus) {
    return s.tests.map((t) => t.name).join(', ');
  }
}
