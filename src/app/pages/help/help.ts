import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { SupportService } from '../../core/support.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { FormField } from '../../shared/form-field';
import { HELP, HelpAudience } from './help-content';

type FeedbackType = 'idea' | 'problem' | 'praise';

/** Role-aware “how do I…” guide + feedback form. */
@Component({
  selector: 'app-help',
  imports: [FormsModule, RouterLink, LucideAngularModule, FormField],
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Help & feedback</h1>
        <p class="text-sm text-slate-500">Quick steps for every page{{ tenant.tenant() ? ' of ' + tenant.name() : '' }} — tap a step’s page to open it.</p>
      </div>
      <span class="pill border-brand/20 bg-brand/5 text-brand">{{ auth.roleLabel() }}</span>
    </div>

    <div class="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
      <div class="min-w-0">
        <div class="relative">
          <lucide-icon name="search" class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <input class="input pl-10!" placeholder="Search help, e.g. “report”, “password”, “token”" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </div>

        <!-- Jump chips -->
        <div class="mt-3 flex flex-wrap gap-1.5">
          @for (s of sections(); track s.id) {
            <a [href]="'#' + s.id" (click)="jump($event, s.id)"
               class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-brand/40 hover:text-brand">
              <lucide-icon [name]="s.icon" class="size-3.5" /> {{ s.title }}
            </a>
          }
        </div>

        <div class="mt-4 space-y-4">
          @for (s of sections(); track s.id) {
            <section [id]="s.id" class="card scroll-mt-24 p-4 sm:p-5">
              <div class="flex items-center gap-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><lucide-icon [name]="s.icon" class="size-4" /></span>
                <h2 class="flex-1 text-[15px] font-bold text-slate-800">{{ s.title }}</h2>
                @if (s.route) {
                  <a [routerLink]="s.route" class="btn-ghost px-3! py-1.5! text-xs">Open <lucide-icon name="arrow-right" class="size-3.5" /></a>
                }
              </div>
              <ol class="mt-3 space-y-2.5">
                @for (st of s.steps; track $index; let i = $index) {
                  <li class="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                    <span class="flex w-36 shrink-0 items-center gap-2 text-sm font-semibold text-slate-700">
                      <span class="grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{{ i + 1 }}</span>
                      {{ st.do }}
                    </span>
                    <span class="flex flex-wrap items-center gap-1">
                      @for (f of st.flow; track $index; let last = $last) {
                        <span class="rounded-md border px-2 py-0.5 text-xs font-medium"
                              [class]="f.endsWith('*') ? 'border-rose-100 bg-rose-50/60 text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-600'">{{ f }}</span>
                        @if (!last) { <lucide-icon name="chevron-right" class="size-3.5 text-slate-300" /> }
                      }
                    </span>
                  </li>
                }
              </ol>
            </section>
          } @empty {
            <div class="card py-12 text-center text-sm text-slate-400">No help matches “{{ q() }}”. Try another word, or ask us below.</div>
          }
        </div>
        <p class="mt-3 text-xs text-slate-400"><span class="rounded border border-rose-100 bg-rose-50/60 px-1">Field *</span> = required field.</p>
      </div>

      <!-- Feedback -->
      <aside class="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <form class="card space-y-4 p-5" (ngSubmit)="send()" novalidate>
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-500"><lucide-icon name="message-square-heart" class="size-5" /></span>
            <div><h2 class="section-title">Send feedback</h2><p class="text-xs text-slate-400">Goes straight to the SpreadApps team.</p></div>
          </div>

          <app-field label="How is it going?" required [error]="show('rating')">
            <div class="flex gap-1" role="radiogroup" aria-label="Rating">
              @for (n of [1, 2, 3, 4, 5]; track n) {
                <button type="button" class="rounded-lg p-1 transition hover:scale-110" (click)="rating.set(n); touch('rating')" [attr.aria-label]="n + ' stars'"
                        [class]="n <= rating() ? 'text-amber-400' : 'text-slate-300'">
                  <lucide-icon name="star" class="size-7" [class.fill-current]="n <= rating()" />
                </button>
              }
              <span class="ml-2 self-center text-xs text-slate-400">{{ ratingLabel() }}</span>
            </div>
          </app-field>

          <app-field label="Type" required>
            <div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              @for (t of types; track t.v) {
                <button type="button" class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition"
                        [class]="type() === t.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'" (click)="type.set(t.v)">
                  <lucide-icon [name]="t.icon" class="size-3.5" /> {{ t.l }}
                </button>
              }
            </div>
          </app-field>

          <app-field label="Message" for="fb-msg" required [error]="show('message')" [counter]="message().length + ' / 1000'" [counterOver]="message().length > 1000"
                     [hint]="type() === 'problem' ? 'What happened, and on which page?' : type() === 'idea' ? 'What would make your work easier?' : 'What do you like?'">
            <textarea id="fb-msg" class="input min-h-28" name="msg" [ngModel]="message()" (ngModelChange)="message.set($event)" (blur)="touch('message')"></textarea>
          </app-field>

          <button class="btn-primary w-full" type="submit" [disabled]="busy()">
            <lucide-icon [name]="busy() ? 'loader-circle' : 'send'" class="size-4" [class.animate-spin]="busy()" /> Send feedback
          </button>
        </form>

        @if (tenant.tenant()) {
          <button class="card flex w-full items-center gap-3 p-4 text-left transition hover:shadow-md" (click)="support.open.set(true)">
            <img src="brand/circles-logo.svg" alt="" class="size-9" />
            <span class="flex-1"><b class="block text-sm text-slate-800">Something broken?</b><span class="text-xs text-slate-400">Raise a support ticket with a screenshot</span></span>
            <lucide-icon name="chevron-right" class="size-4 text-slate-400" />
          </button>
        }
      </aside>
    </div>
  `,
})
export class HelpPage {
  protected readonly auth = inject(AuthService);
  protected readonly tenant = inject(TenantService);
  protected readonly support = inject(SupportService);
  private readonly toast = inject(ToastService);

  protected readonly types: { v: FeedbackType; l: string; icon: string }[] = [
    { v: 'idea', l: 'Idea', icon: 'lightbulb' },
    { v: 'problem', l: 'Problem', icon: 'triangle-alert' },
    { v: 'praise', l: 'Praise', icon: 'thumbs-up' },
  ];
  protected readonly q = signal('');
  protected readonly rating = signal(0);
  protected readonly type = signal<FeedbackType>('idea');
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  private readonly touched = signal<Record<string, boolean>>({});
  private readonly submitted = signal(false);

  /** Which help applies to the signed-in person. */
  private readonly audiences = computed<HelpAudience[]>(() => {
    if (!this.tenant.tenant()) return this.auth.isRoot() ? ['platform', 'root'] : ['platform'];
    return this.auth.isOwner() ? ['owner'] : ['staff'];
  });

  protected readonly sections = computed(() => {
    const who = this.audiences();
    const q = this.q().trim().toLowerCase();
    return HELP.filter((s) => s.who.some((w) => who.includes(w))).filter(
      (s) => !q || s.title.toLowerCase().includes(q) || s.steps.some((st) => st.do.toLowerCase().includes(q) || st.flow.some((f) => f.toLowerCase().includes(q))),
    );
  });

  protected readonly ratingLabel = computed(() => ['Tap a star', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent'][this.rating()]);

  private readonly errors = computed(() => {
    const e: Record<string, string> = {};
    if (!this.rating()) e['rating'] = 'Pick 1 to 5 stars.';
    const m = this.message().trim();
    if (!m) e['message'] = 'Tell us a little more — a sentence or two is perfect.';
    else if (m.length < 10) e['message'] = 'Add a few more words (at least 10 characters).';
    else if (m.length > 1000) e['message'] = 'Keep it under 1,000 characters.';
    return e;
  });

  show(f: string): string | null {
    return this.submitted() || this.touched()[f] ? (this.errors()[f] ?? null) : null;
  }

  touch(f: string) {
    this.touched.update((t) => ({ ...t, [f]: true }));
  }

  jump(ev: Event, id: string) {
    ev.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async send() {
    this.submitted.set(true);
    const n = Object.keys(this.errors()).length;
    if (n) return this.toast.warn(n === 1 ? 'One field needs attention.' : `${n} fields need attention.`);
    this.busy.set(true);
    try {
      await this.support.submitFeedback(this.rating(), this.type(), this.message());
      this.toast.success('Thanks! Your feedback reached the SpreadApps team.');
      this.rating.set(0);
      this.message.set('');
      this.submitted.set(false);
      this.touched.set({});
    } catch (e) {
      this.toast.fail(e, 'Could not send feedback.');
    } finally {
      this.busy.set(false);
    }
  }
}
