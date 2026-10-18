import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { CirclesLogo } from '../../shared/circles-logo';
import { AdminService } from '../../core/admin.service';
import { SupportTicket } from '../../core/models';
import { ToastService } from '../../core/toast.service';

const PRIORITY: Record<SupportTicket['priority'], string> = {
  low: 'border-slate-200 bg-slate-50 text-slate-500',
  normal: 'border-blue-100 bg-blue-50 text-blue-600',
  high: 'border-amber-100 bg-amber-50 text-amber-600',
  urgent: 'border-rose-100 bg-rose-50 text-rose-600',
};

@Component({
  selector: 'app-admin-support',
  imports: [FormsModule, RouterLink, LucideAngularModule, DatePipe, CirclesLogo],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-slate-900"><app-circles-logo [size]="30" /> Support · Circles</h1>
        <p class="text-sm text-slate-500">Tickets raised from inside lab dashboards, with lab context and screenshots.</p>
      </div>
      <a routerLink="/admin/settings" class="btn-ghost"><lucide-icon name="settings" class="size-4" /> Circles connection</a>
    </div>

    <div class="mt-5 flex flex-wrap gap-2">
    <div class="flex gap-1 rounded-xl bg-slate-100/80 p-1">
      @for (k of kinds; track k.v) {
        <button class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                [class]="kind() === k.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="kind.set(k.v)">
          <lucide-icon [name]="k.icon" class="size-3.5" /> {{ k.l }} <span class="text-slate-400">{{ kindCount(k.v) }}</span>
        </button>
      }
    </div>
    <div class="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 sm:inline-flex">
      @for (s of statuses; track s) {
        <button class="rounded-lg px-3 py-1.5 text-xs font-semibold capitalize whitespace-nowrap transition"
                [class]="filter() === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="filter.set(s)">{{ s.replace('_', ' ') }}</button>
      }
    </div>
    </div>

    <div class="mt-4 grid gap-3">
      @for (t of visible(); track t.id) {
        <article class="card p-4 sm:p-5">
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-bold text-slate-400">#{{ t.id.slice(0, 8).toUpperCase() }}</span>
                @if (t.kind === 'feedback') {
                  <span class="pill border-amber-100 bg-amber-50 text-amber-600">
                    @for (n of [1, 2, 3, 4, 5]; track n) { <lucide-icon name="star" class="size-3" [class.fill-current]="n <= (t.rating ?? 0)" [class.opacity-30]="n > (t.rating ?? 0)" /> }
                  </span>
                } @else {
                  <span class="pill capitalize" [class]="tone(t.priority)">{{ t.priority }}</span>
                }
                <span class="text-xs font-semibold text-brand">{{ labName(t.tenant_id) }}</span>
              </div>
              <h3 class="mt-1 font-bold text-slate-800">{{ t.summary }}</h3>
              <p class="mt-1 line-clamp-3 text-sm whitespace-pre-line text-slate-500">{{ t.details }}</p>
              <p class="mt-2 text-xs text-slate-400">{{ t.reporter_email }} · {{ t.created_at | date: 'MMM d, h:mm a' }}</p>
            </div>
            <div class="flex items-center gap-2">
              @if (t.screenshot_path) {
                <button class="btn-ghost py-2! text-xs" (click)="openShot(t)"><lucide-icon name="image" class="size-3.5" /> Screenshot</button>
              }
              <select class="input w-auto! py-2! text-xs" [ngModel]="t.status" (ngModelChange)="setStatus(t, $event)">
                @for (s of statuses.slice(1); track s) { <option [value]="s">{{ s.replace('_', ' ') }}</option> }
              </select>
            </div>
          </div>
        </article>
      } @empty {
        <div class="card py-14 text-center text-sm text-slate-400">No tickets here.</div>
      }
    </div>
  `,
})
export class AdminSupport implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  protected readonly statuses = ['all', 'open', 'synced', 'in_progress', 'resolved', 'closed'] as const;
  protected readonly filter = signal<(typeof this.statuses)[number]>('open');
  protected readonly tickets = signal<SupportTicket[]>([]);
  protected readonly kinds = [
    { v: 'ticket' as const, l: 'Tickets', icon: 'life-buoy' },
    { v: 'feedback' as const, l: 'Feedback', icon: 'message-square-heart' },
    { v: 'lead' as const, l: 'Demo requests', icon: 'calendar-clock' },
  ];
  protected readonly kind = signal<'ticket' | 'feedback' | 'lead'>('ticket');
  protected readonly visible = computed(() =>
    this.tickets()
      .filter((t) => (t.kind ?? 'ticket') === this.kind())
      .filter((t) => this.filter() === 'all' || t.status === this.filter()),
  );

  kindCount(k: 'ticket' | 'feedback' | 'lead') {
    return this.tickets().filter((t) => (t.kind ?? 'ticket') === k && t.status !== 'closed' && t.status !== 'resolved').length;
  }

  async ngOnInit() {
    await this.admin.ensureLoaded();
    this.tickets.set(await this.admin.tickets());
  }

  tone(p: SupportTicket['priority']) {
    return PRIORITY[p];
  }

  labName(id: string | null) {
    return id ? (this.admin.tenants().find((t) => t.id === id)?.name ?? 'Unknown lab') : 'Platform';
  }

  async setStatus(t: SupportTicket, status: SupportTicket['status']) {
    try {
      await this.admin.setTicketStatus(t.id, status);
      this.tickets.update((l) => l.map((x) => (x.id === t.id ? { ...x, status } : x)));
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async openShot(t: SupportTicket) {
    const url = await this.admin.screenshotUrl(t.screenshot_path!);
    if (url) window.open(url, '_blank', 'noopener');
    else this.toast.error('Could not open screenshot');
  }
}
