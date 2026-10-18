import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Avatar } from './avatar';

export interface TimelineItem {
  id: string | number;
  at: string;
  title: string;
  subtitle?: string | null;
  icon: string;
  /** Tailwind classes for the icon dot, e.g. 'bg-emerald-100 text-emerald-600' */
  tone: string;
  actorName?: string | null;
  actorAvatar?: string | null;
  /** Small chips shown under the title */
  chips?: string[];
  /** Optional link (e.g. report PDF) */
  link?: { label: string; href: string } | null;
}

/**
 * Vertical timeline, newest first, grouped by day (Today / Yesterday / date).
 * Used for patient history, activity, announcements and more.
 */
@Component({
  selector: 'app-timeline',
  imports: [LucideAngularModule, DatePipe, Avatar],
  template: `
    @for (g of groups(); track g.label) {
      <div class="mb-1 flex items-center gap-2 pt-2" [class.pt-0]="$first">
        <span class="text-[11px] font-bold tracking-wider text-slate-400 uppercase">{{ g.label }}</span>
        <span class="h-px flex-1 bg-slate-100"></span>
      </div>
      <ol class="relative">
        @for (it of g.items; track it.id; let last = $last) {
          <li class="relative flex gap-3 pb-4" [class.pb-1]="last">
            @if (!last) { <span class="absolute top-9 bottom-0 left-[17px] w-0.5 rounded bg-slate-100"></span> }
            <span class="relative z-10 grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-white {{ it.tone }}">
              <lucide-icon [name]="it.icon" class="size-4" />
            </span>
            <div class="min-w-0 flex-1 pt-1">
              <div class="flex flex-wrap items-baseline gap-x-2">
                <p class="text-sm font-semibold text-slate-800">{{ it.title }}</p>
                <span class="text-[11px] text-slate-400">{{ it.at | date: 'h:mm a' }}</span>
              </div>
              @if (it.subtitle) { <p class="mt-0.5 text-xs text-slate-500">{{ it.subtitle }}</p> }
              @if (it.chips?.length || it.actorName || it.link) {
                <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  @for (c of it.chips; track c) {
                    <span class="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{{ c }}</span>
                  }
                  @if (it.actorName) {
                    <span class="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <app-avatar [name]="it.actorName" [url]="it.actorAvatar" [size]="16" /> {{ it.actorName }}
                    </span>
                  }
                  @if (it.link) {
                    <a [href]="it.link.href" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline">
                      <lucide-icon name="download" class="size-3" /> {{ it.link.label }}
                    </a>
                  }
                </div>
              }
            </div>
          </li>
        }
      </ol>
    } @empty {
      <div class="flex flex-col items-center py-10 text-center">
        <span class="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><lucide-icon name="history" class="size-6" /></span>
        <p class="mt-3 text-sm text-slate-400">{{ empty() }}</p>
      </div>
    }
  `,
})
export class Timeline {
  readonly items = input.required<TimelineItem[]>();
  readonly empty = input('Nothing here yet.');

  protected readonly groups = computed(() => {
    const sorted = [...this.items()].sort((a, b) => b.at.localeCompare(a.at));
    const today = new Date();
    const key = (d: Date) => d.toDateString();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const out: { label: string; items: TimelineItem[] }[] = [];
    for (const it of sorted) {
      const d = new Date(it.at);
      const label =
        key(d) === key(today) ? 'Today'
        : key(d) === key(yesterday) ? 'Yesterday'
        : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  });
}
