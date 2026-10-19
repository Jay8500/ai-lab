import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { DialogService } from '../../core/dialog.service';
import { ReportValue, VisitStatus } from '../../core/models';
import { SupabaseService } from '../../core/supabase.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { Avatar } from '../../shared/avatar';
import { BrandMark } from '../../shared/brand-mark';
import { buildTrends, Trends } from '../../shared/trends';

interface MyVisit {
  token: string;
  key: string;
  patient_name: string;
  status: VisitStatus;
  created_at: string;
  tests: { code: string; name: string }[];
  report_path: string | null;
  ai_values: ReportValue[] | null;
}
interface MyBooking {
  ref: string;
  status: 'requested' | 'confirmed' | 'cancelled' | 'completed';
  status_note: string | null;
  preferred_date: string;
  slot: string;
  collection: 'lab' | 'home';
  tests: { code: string; name: string; price: number }[];
  amount: number;
}
interface Records {
  linked: boolean;
  visits: MyVisit[];
  bookings: MyBooking[];
}

/** Patient portal: Google sign-in, then every report and booking at this lab in one place. */
@Component({
  selector: 'app-me',
  imports: [FormsModule, LucideAngularModule, RouterLink, DatePipe, Avatar, BrandMark, Trends],
  template: `
    <div class="min-h-dvh bg-slate-50">
      <header class="relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-brand via-brand/90 to-accent"></div>
        <div class="relative mx-auto flex max-w-3xl items-center gap-3 px-4 pt-6 pb-20 text-white">
          <a routerLink="/" class="flex min-w-0 flex-1 items-center gap-3">
            <img [src]="tenant.logo()" alt="" class="size-11 shrink-0 rounded-xl bg-white object-contain p-1" />
            <div class="min-w-0"><p class="truncate text-lg font-bold">{{ tenant.name() }}</p><p class="truncate text-xs text-white/75">My reports</p></div>
          </a>
          @if (auth.isPatient()) {
            <button class="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25" (click)="signOut()">Sign out</button>
          }
        </div>
      </header>

      <main class="relative mx-auto -mt-14 max-w-3xl space-y-4 px-4 pb-12">
        @if (!ready()) {
          <div class="card grid place-items-center p-12"><lucide-icon name="loader-circle" class="size-6 animate-spin text-slate-300" /></div>
        } @else if (auth.isLabUser() || auth.isPlatformAdmin()) {
          <div class="card p-6 text-center text-sm text-slate-600">
            You’re signed in as {{ auth.roleLabel() }}. This page is for patients.
            <a [routerLink]="auth.isLabUser() ? '/lab' : '/'" class="btn-primary mt-4">Open my workspace</a>
          </div>
        } @else if (!auth.isPatient()) {
          <!-- Sign in -->
          <section class="card p-6 text-center sm:p-8">
            <span class="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><lucide-icon name="file-text" class="size-7" /></span>
            <h1 class="mt-3 text-xl font-bold text-slate-800">All your reports in one place</h1>
            <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">Sign in to see every report, trend and booking you have at {{ tenant.name() }} — no token needed after the first time.</p>
            @if (!auth.googleEnabled()) {
              <p class="mx-auto mt-6 max-w-sm rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">Patient sign-in is coming soon. Meanwhile, track any report with the token on your receipt.</p>
            } @else {
            <button class="mx-auto mt-6 flex w-full max-w-xs items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50" (click)="google()" [disabled]="busy()">
              <svg viewBox="0 0 48 48" class="size-5" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Continue with Google
            </button>
            }
            <p class="mt-4 text-xs text-slate-400">We only use your name and email to sign you in. Your reports stay private — you prove they’re yours once with your token and mobile number.</p>
            <div class="mt-6 flex flex-wrap justify-center gap-2 text-sm">
              <a routerLink="/track" class="btn-ghost py-2!"><lucide-icon name="search" class="size-4" /> Track with a token</a>
              @if (tenant.pages().show_booking !== false) { <a routerLink="/book" class="btn-ghost py-2!"><lucide-icon name="calendar-clock" class="size-4" /> Book a test</a> }
            </div>
          </section>
        } @else {
          <!-- Signed in -->
          <section class="card flex items-center gap-3 p-4">
            <app-avatar [name]="auth.displayName()" [url]="auth.profile()?.avatar_url" [size]="44" />
            <div class="min-w-0 flex-1"><p class="truncate font-bold text-slate-800">{{ auth.displayName() }}</p><p class="truncate text-xs text-slate-400">{{ auth.profile()?.email }}</p></div>
            @if (tenant.pages().show_booking !== false) { <a routerLink="/book" class="btn-primary py-2! text-xs"><lucide-icon name="calendar-clock" class="size-3.5" /> Book a test</a> }
          </section>

          <!-- Add a report -->
          <section class="card p-5">
            <h2 class="flex items-center gap-2 font-bold text-slate-800"><lucide-icon name="plus" class="size-4 text-brand" /> {{ rec()?.linked ? 'Add another report' : 'Add your first report' }}</h2>
            <p class="mt-1 text-xs text-slate-500">Enter a token from your receipt and the last 4 digits of the mobile you gave the lab. After that, all your visits with that mobile appear here automatically.</p>
            <form class="mt-3 flex flex-wrap gap-2" (ngSubmit)="link()">
              <input class="input min-w-0 flex-1 font-mono uppercase" name="t" [(ngModel)]="token" [placeholder]="'Token e.g. ' + example()" autocomplete="off" />
              <input class="input w-32 text-center font-mono" name="l" [(ngModel)]="last4" placeholder="Mobile ••••" inputmode="numeric" maxlength="4" autocomplete="off" />
              <button class="btn-primary" type="submit" [disabled]="busy()"><lucide-icon [name]="busy() ? 'loader-circle' : 'link'" class="size-4" [class.animate-spin]="busy()" /> Add</button>
            </form>
          </section>

          @if (trends().length && tenant.pages().show_ai !== false) {
            <section class="card p-5">
              <h2 class="flex items-center gap-2 font-bold text-slate-800"><lucide-icon name="trending-up" class="size-4 text-violet-600" /> How your results changed</h2>
              <app-trends [series]="trends()" [limit]="5" />
            </section>
          }

          <!-- Reports -->
          <section class="card p-5">
            <h2 class="font-bold text-slate-800">My reports</h2>
            <ul class="mt-3 divide-y divide-slate-100">
              @for (v of rec()?.visits ?? []; track v.token) {
                <li class="flex flex-wrap items-center gap-3 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-slate-800">{{ testNames(v) }}</p>
                    <p class="text-xs text-slate-400">#{{ v.token }} · {{ v.created_at | date: 'MMM d, y' }} · {{ v.patient_name }}</p>
                  </div>
                  <span class="pill" [class]="v.report_path ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-amber-100 bg-amber-50 text-amber-600'">{{ v.report_path ? 'Ready' : 'In progress' }}</span>
                  <a class="btn-ghost px-3! py-1.5! text-xs" [routerLink]="['/track', v.token]" [queryParams]="{ k: v.key }">Open</a>
                  @if (v.report_path) { <a class="btn-success px-3! py-1.5! text-xs" [href]="pdf(v.report_path)" target="_blank" rel="noopener"><lucide-icon name="download" class="size-3.5" /> PDF</a> }
                </li>
              } @empty {
                <li class="py-6 text-center text-sm text-slate-400">No reports added yet.</li>
              }
            </ul>
          </section>

          @if (rec()?.bookings?.length) {
            <section class="card p-5">
              <h2 class="font-bold text-slate-800">My bookings</h2>
              <ul class="mt-3 divide-y divide-slate-100">
                @for (b of rec()!.bookings; track b.ref) {
                  <li class="py-3 text-sm">
                    <p class="flex items-center gap-2"><b class="font-mono text-slate-800">{{ b.ref }}</b> <span class="pill" [class]="tone(b.status)">{{ label(b.status) }}</span></p>
                    <p class="mt-0.5 text-xs text-slate-500">{{ b.preferred_date | date: 'EEE, MMM d' }} · {{ b.slot }} · {{ b.collection === 'home' ? 'home collection' : 'at the lab' }}{{ b.amount ? ' · ₹' + b.amount : '' }}</p>
                    @if (b.status_note) { <p class="mt-1 text-xs text-slate-600">Lab: “{{ b.status_note }}”</p> }
                  </li>
                }
              </ul>
            </section>
          }

          @if (rec()?.linked) {
            <button class="mx-auto block text-xs font-semibold text-slate-400 hover:text-rose-600" (click)="unlink()">Remove {{ tenant.name() }} records from my account</button>
          }
        }
        @if (tenant.pages().show_powered_by !== false) { <div class="flex justify-center pt-2"><app-brand-mark /></div> }
      </main>
    </div>
  `,
})
export class MePage {
  protected readonly auth = inject(AuthService);
  protected readonly tenant = inject(TenantService);
  private readonly sb = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);

  protected readonly ready = signal(false);
  protected readonly busy = signal(false);
  protected readonly rec = signal<Records | null>(null);
  protected token = '';
  protected last4 = '';
  protected readonly example = computed(() => {
    const d = new Date();
    return `${(this.tenant.tenant()?.token_prefix || 'LAB').toUpperCase()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-001`;
  });
  protected readonly trends = computed(() => buildTrends((this.rec()?.visits ?? []).map((v) => ({ at: v.created_at, token: v.token, values: v.ai_values }))));

  constructor() {
    this.auth.checkGoogle();
    void this.auth.init().then(() => this.ready.set(true));
    effect(() => {
      if (this.ready() && this.auth.isPatient() && this.tenant.slug()) void this.load();
    });
  }

  async load() {
    const { data } = await this.sb.client.rpc('my_lab_records', { p_slug: this.tenant.slug() });
    this.rec.set((data as Records) ?? { linked: false, visits: [], bookings: [] });
  }

  async google() {
    this.busy.set(true);
    try {
      await this.auth.signInWithGoogle('/me');
    } catch (e) {
      this.toast.fail(e);
      this.busy.set(false);
    }
  }

  async link() {
    const t = this.token.trim().toUpperCase();
    const l = this.last4.replace(/\D/g, '');
    if (!/^[A-Z]{1,5}-\d{4}-\d{3}$/.test(t) || l.length !== 4) return this.toast.warn('Enter the token (e.g. ' + this.example() + ') and the last 4 digits of your mobile.');
    this.busy.set(true);
    const { data, error } = await this.sb.client.rpc('link_patient', { p_slug: this.tenant.slug(), p_token: t, p_last4: l });
    this.busy.set(false);
    if (error) return this.toast.fail(error);
    if (!data?.ok) {
      const why = data?.reason === 'blocked' ? 'Too many tries — please wait 15 minutes.' : data?.reason === 'not_found' ? 'No visit with that token at this lab.' : 'Those digits don’t match the mobile for this token.';
      return this.toast.warn(why);
    }
    this.token = this.last4 = '';
    this.toast.success('Added — your reports with this mobile now show here.');
    await this.load();
  }

  async unlink() {
    const ok = await this.dialog.confirm({
      title: 'Remove these records from your account?',
      message: `Your reports stay with ${this.tenant.name()}; they just won’t show here until you add them again.`,
      confirmText: 'Remove', tone: 'danger',
    });
    if (!ok) return;
    const t = this.tenant.tenant();
    const { error } = await this.sb.client.from('patient_links').delete().eq('tenant_id', t?.id ?? '');
    if (error) return this.toast.fail(error);
    await this.load();
    this.toast.info('Removed from your account.');
  }

  async signOut() {
    await this.auth.signOut();
    this.rec.set(null);
  }

  testNames(v: MyVisit) {
    return v.tests.map((t) => t.name).join(', ');
  }
  pdf(path: string) {
    return this.sb.publicUrl('reports', path);
  }
  label(s: string) {
    return { requested: 'Waiting for the lab', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Sample registered' }[s] ?? s;
  }
  tone(s: string) {
    return s === 'confirmed' || s === 'completed' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : s === 'cancelled' ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-amber-100 bg-amber-50 text-amber-600';
  }
}
