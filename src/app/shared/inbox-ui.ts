import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../environments/environment';
import { ANN_STYLE, InboxService, renderMessage } from '../core/inbox.service';
import { Modal } from './modal';

/** Bell with unread count + dropdown list of Spread Apps announcements. */
@Component({
  selector: 'app-notification-bell',
  imports: [LucideAngularModule, DatePipe],
  template: `
    <div class="relative">
      <button class="relative grid size-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              (click)="openList.set(!openList())" [attr.aria-label]="inbox.unread() + ' unread updates'" title="Updates from Spread Apps">
        <lucide-icon name="bell" class="size-5" />
        @if (inbox.unread()) {
          <span class="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-white">{{ inbox.unread() }}</span>
        }
      </button>
      @if (openList()) {
        <div class="fixed inset-0 z-40" (click)="openList.set(false)"></div>
        <div class="animate-fade-up absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
          <div class="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <img [src]="brandLogo" alt="" class="size-5" />
            <b class="text-sm text-slate-800">Updates from Spread Apps</b>
            @if (inbox.unread()) {
              <button class="ml-auto text-xs font-semibold text-brand hover:underline" (click)="inbox.markAllRead()">Mark all read</button>
            }
          </div>
          <ul class="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            @for (i of inbox.items(); track i.id) {
              @let st = style[i.category];
              <li>
                <button class="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50" (click)="inbox.openItem(i); openList.set(false)">
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg {{ st.iconBox }}"><lucide-icon [name]="st.icon" class="size-4" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-2">
                      <span class="pill px-1.5! py-0! text-[10px] {{ st.pill }}">{{ st.label }}</span>
                      <span class="text-[11px] text-slate-400">{{ i.created_at | date: 'MMM d' }}</span>
                      @if (!i.read_at) { <span class="ml-auto size-2 rounded-full bg-brand"></span> }
                    </span>
                    <span class="mt-0.5 block truncate text-sm" [class]="i.read_at ? 'text-slate-600' : 'font-semibold text-slate-800'">{{ inbox.personalise(i.subject) }}</span>
                  </span>
                </button>
              </li>
            } @empty {
              <li class="px-4 py-10 text-center text-sm text-slate-400">No updates yet.</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class NotificationBell {
  protected readonly inbox = inject(InboxService);
  protected readonly style = ANN_STYLE;
  protected readonly brandLogo = environment.brand.logo;
  protected readonly openList = signal(false);
}

/** Banner on every lab page for payment / maintenance / trial messages until dismissed. */
@Component({
  selector: 'app-announcement-banner',
  imports: [LucideAngularModule],
  template: `
    @if (inbox.banner(); as b) {
      @let st = style[b.category];
      <div class="animate-fade-in border-b {{ st.banner }}">
        <div class="flex items-center gap-3 px-4 py-2.5 sm:px-6">
          <span class="grid size-8 shrink-0 place-items-center rounded-lg {{ st.iconBox }}"><lucide-icon [name]="st.icon" class="size-4" /></span>
          <p class="min-w-0 flex-1 text-sm">
            <b>{{ st.label }} · </b><span class="font-medium">{{ inbox.personalise(b.subject) }}</span>
            <span class="hidden opacity-70 sm:inline"> — from Spread Apps</span>
          </p>
          <button class="shrink-0 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-bold shadow-sm transition hover:bg-white" (click)="inbox.openItem(b)">Read</button>
          <button class="shrink-0 rounded-lg p-1.5 opacity-60 transition hover:bg-black/5 hover:opacity-100" (click)="inbox.dismiss(b)" aria-label="Dismiss" title="Dismiss">
            <lucide-icon name="x" class="size-4" />
          </button>
        </div>
      </div>
    }
  `,
})
export class AnnouncementBanner {
  protected readonly inbox = inject(InboxService);
  protected readonly style = ANN_STYLE;
}

/** Full message reader (personalised with the reader's own name and lab). */
@Component({
  selector: 'app-announcement-reader',
  imports: [LucideAngularModule, DatePipe, Modal],
  template: `
    @if (inbox.open(); as m) {
      @let st = style[m.category];
      <app-modal [title]="inbox.personalise(m.subject)" [subtitle]="'From Spread Apps · ' + (m.created_at | date: 'MMM d, y · h:mm a')" [width]="560" (closed)="inbox.open.set(null)">
        <span class="pill mb-4 {{ st.pill }}"><lucide-icon [name]="st.icon" class="size-3.5" /> {{ st.label }}</span>
        <div class="space-y-3 text-sm leading-relaxed text-slate-600" [innerHTML]="html()"></div>
        <div class="mt-6 flex items-center gap-2 border-t border-slate-100 pt-4">
          <img [src]="brandLogo" alt="" class="size-5" />
          <span class="text-xs text-slate-400">Spread Apps AI-Lab</span>
          @if (!m.dismissed_at) {
            <button class="btn-ghost ml-auto py-1.5! text-xs" (click)="inbox.dismiss(m); inbox.open.set(null)">Dismiss</button>
          }
          <button class="btn-primary py-1.5! text-xs" [class.ml-auto]="m.dismissed_at" (click)="inbox.open.set(null)">Got it</button>
        </div>
      </app-modal>
    }
  `,
})
export class AnnouncementReader {
  protected readonly inbox = inject(InboxService);
  protected readonly style = ANN_STYLE;
  protected readonly brandLogo = environment.brand.logo;
  protected readonly html = computed(() => {
    const m = this.inbox.open();
    return m ? renderMessage(this.inbox.personalise(m.body)) : '';
  });
}
