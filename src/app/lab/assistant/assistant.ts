import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { renderMessage } from '../../core/inbox.service';
import { LabService } from '../../core/lab.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  html?: string;
  error?: boolean;
}

const SUGGESTIONS = [
  'How many patients and how much revenue today?',
  'Which tests earned the most in the last 30 days?',
  'Which reports have been waiting the longest?',
  'Compare this week with last week.',
  'What is our average turnaround per test?',
  'Which ready reports are not delivered yet?',
];

/** Ask AI: staff ask questions about the lab's own numbers (lab-assistant edge function, lab's own key). */
@Component({
  selector: 'app-lab-assistant',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="mx-auto flex h-[calc(100dvh-11rem)] max-w-3xl flex-col md:h-[calc(100dvh-8.5rem)]">
      <div class="flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><lucide-icon name="bot" class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-extrabold tracking-tight text-slate-900">Ask AI</h1>
          <p class="truncate text-xs text-slate-500">Questions about {{ tenant.name() }}’s last 90 days — visits, tests, revenue, turnaround.</p>
        </div>
        @if (msgs().length) {
          <button class="btn-ghost px-3! py-1.5! text-xs" (click)="msgs.set([])"><lucide-icon name="refresh-cw" class="size-3.5" /> New chat</button>
        }
      </div>

      <div #scroller class="mt-4 flex-1 space-y-4 overflow-y-auto rounded-3xl border border-slate-100 bg-white p-4 sm:p-5">
        @if (!msgs().length) {
          <div class="grid h-full place-items-center text-center">
            <div class="max-w-md">
              <span class="mx-auto grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-brand text-white"><lucide-icon name="sparkles" class="size-6" /></span>
              <p class="mt-3 font-bold text-slate-800">What would you like to know?</p>
              <p class="mt-1 text-xs text-slate-400">The AI sees counts, tests, tokens and amounts — never patient names or phone numbers.</p>
              <div class="mt-5 flex flex-wrap justify-center gap-2">
                @for (s of suggestions; track s) {
                  <button class="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand hover:text-brand" (click)="send(s)">{{ s }}</button>
                }
              </div>
            </div>
          </div>
        }
        @for (m of msgs(); track $index) {
          @if (m.role === 'user') {
            <div class="flex justify-end"><p class="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-white">{{ m.content }}</p></div>
          } @else {
            <div class="flex gap-2.5">
              <span class="grid size-7 shrink-0 place-items-center rounded-full" [class]="m.error ? 'bg-rose-50 text-rose-500' : 'bg-violet-50 text-violet-600'">
                <lucide-icon [name]="m.error ? 'triangle-alert' : 'sparkles'" class="size-3.5" />
              </span>
              <div class="max-w-[90%] rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed [&_p]:m-0 [&_p+p]:mt-2"
                   [class]="m.error ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-700'" [innerHTML]="m.html"></div>
            </div>
          }
        }
        @if (busy()) {
          <div class="flex gap-2.5">
            <span class="grid size-7 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600"><lucide-icon name="sparkles" class="size-3.5 animate-pulse" /></span>
            <div class="w-2/3 space-y-2 rounded-2xl rounded-tl-md bg-slate-50 px-4 py-3">
              <div class="h-2.5 w-11/12 animate-pulse rounded bg-violet-100"></div>
              <div class="h-2.5 w-8/12 animate-pulse rounded bg-violet-100"></div>
              <div class="h-2.5 w-9/12 animate-pulse rounded bg-violet-100"></div>
            </div>
          </div>
        }
      </div>

      <form class="mt-3 flex items-end gap-2" (ngSubmit)="send(q)">
        <textarea class="input max-h-32 min-h-11 flex-1 resize-none py-2.5!" name="q" rows="1" [(ngModel)]="q" maxlength="500"
                  placeholder="Ask about your lab… e.g. busiest day this month" (keydown.enter)="enter($event)"></textarea>
        <button class="btn-primary size-11 shrink-0 px-0!" type="submit" [disabled]="busy() || q.trim().length < 3" aria-label="Send">
          <lucide-icon name="send-horizontal" class="size-4" />
        </button>
      </form>
      <p class="mt-1.5 text-center text-[11px] text-slate-400">AI can make mistakes — check important numbers on the dashboard.</p>
    </div>
  `,
})
export class LabAssistant {
  protected readonly tenant = inject(TenantService);
  private readonly lab = inject(LabService);
  private readonly toast = inject(ToastService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly suggestions = SUGGESTIONS;
  protected readonly msgs = signal<Msg[]>([]);
  protected readonly busy = signal(false);
  protected q = '';

  enter(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey) return;
    k.preventDefault();
    this.send(this.q);
  }

  async send(text: string) {
    const question = text.replace(/\s+/g, ' ').trim();
    if (question.length < 3 || this.busy()) return;
    const history = this.msgs().filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    this.msgs.update((m) => [...m, { role: 'user', content: question }]);
    this.q = '';
    this.busy.set(true);
    this.scroll();
    try {
      const answer = await this.lab.ask(question, history);
      this.msgs.update((m) => [...m, { role: 'assistant', content: answer, html: renderMessage(answer) }]);
    } catch (e) {
      const msg = (e as Error).message || 'Could not answer right now — try again.';
      this.msgs.update((m) => [...m, { role: 'assistant', content: msg, html: renderMessage(msg), error: true }]);
      if (/set up|turned off/i.test(msg)) this.toast.warn(msg);
    } finally {
      this.busy.set(false);
      this.scroll();
    }
  }

  private scroll() {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }
}
