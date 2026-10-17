import { Component, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter } from 'rxjs';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Optional image (e.g. a partner logo) shown instead of the icon */
  img?: string;
  exact?: boolean;
  badge?: number;
}

const COLLAPSE_KEY = 'sa_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Shared so top bars can open the drawer and shells can offset content. */
const collapsed = signal(readCollapsed());
const peek = signal(false);

export const SidebarState = {
  drawer: signal(false),
  /** Pinned state the user chose (drives the page's left offset). */
  collapsed,
  /** Collapsed rail temporarily slid open by hovering it. */
  peek,
  /** What the rail actually shows right now: icons only? */
  compact: computed(() => collapsed() && !peek()),
  toggleCollapsed() {
    const v = !SidebarState.collapsed();
    SidebarState.collapsed.set(v);
    SidebarState.peek.set(false);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  },
};

/**
 * Left navigation: fixed rail from md up (collapsible to icons), slide-in drawer on phones.
 * Brand, collapsed mark and footer are projected by the shell.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    @let mini = state.compact();
    @if (state.drawer()) {
      <div class="animate-fade-in fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] md:hidden" (click)="state.drawer.set(false)"></div>
    }
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-100 bg-white transition-[width,translate,box-shadow] duration-300 ease-out md:translate-x-0"
      [class]="{ '-translate-x-full': !state.drawer(), 'md:w-[76px]': mini, 'md:shadow-2xl': state.peek(), 'md:shadow-slate-900/10': state.peek() }"
      (mouseenter)="onEnter()"
      (mouseleave)="onLeave()"
    >
      <div class="flex h-16 shrink-0 items-center gap-2 px-4" [class]="{ 'md:justify-center': mini, 'md:px-0': mini }">
        <div class="min-w-0 flex-1" [class]="{ 'md:hidden': mini }"><ng-content select="[sidebar-brand]" /></div>
        <!-- Collapsed: the logo is the expand button (shows the expand icon on hover / focus) -->
        <button type="button" class="group relative hidden size-11 place-items-center rounded-xl transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none"
                [class]="{ 'md:grid': mini }" (click)="state.toggleCollapsed()" title="Expand menu" aria-label="Expand menu">
          <span class="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"><ng-content select="[sidebar-mark]" /></span>
          <lucide-icon name="panel-left-open"
                       class="absolute size-5 text-slate-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
        @if (state.peek()) {
          <!-- Slid open by hover: pin it, or close it again -->
          <button class="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand md:block"
                  (click)="state.toggleCollapsed()" title="Keep menu open" aria-label="Keep menu open">
            <lucide-icon name="pin" class="size-4" />
          </button>
          <button class="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:block"
                  (click)="closePeek()" title="Close menu" aria-label="Close menu">
            <lucide-icon name="panel-left-close" class="size-[18px]" />
          </button>
        } @else {
          <button class="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" [class]="{ 'md:block': !mini }"
                  (click)="state.toggleCollapsed()" title="Collapse menu" aria-label="Collapse menu">
            <lucide-icon name="panel-left-close" class="size-[18px]" />
          </button>
        }
        <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden" (click)="state.drawer.set(false)" aria-label="Close menu">
          <lucide-icon name="x" class="size-5" />
        </button>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        @if (heading()) {
          <p class="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase" [class]="{ 'md:hidden': mini }">{{ heading() }}</p>
        }
        @for (n of items(); track n.path) {
          <a [routerLink]="n.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!n.exact }"
             class="nav-link relative" [class]="{ 'md:justify-center': mini, 'md:px-0': mini }" [title]="n.label">
            @if (n.img) {
              <img [src]="n.img" alt="" class="size-[18px] shrink-0" />
            } @else {
              <lucide-icon [name]="n.icon" class="size-[18px] shrink-0" />
            }
            <span class="truncate" [class]="{ 'md:hidden': mini }">{{ n.label }}</span>
            @if (n.badge) {
              <span class="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white" [class]="{ 'md:absolute': mini, 'md:top-1': mini, 'md:right-2': mini }">{{ n.badge }}</span>
            }
          </a>
        }
      </nav>

      <div class="shrink-0 border-t border-slate-100 p-3">
        <ng-content select="[sidebar-footer]" />
      </div>
    </aside>
  `,
})
export class Sidebar {
  readonly items = input.required<NavItem[]>();
  readonly heading = input('');
  protected readonly state = SidebarState;
  private peekTimer?: ReturnType<typeof setTimeout>;
  private readonly canHover = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (min-width: 768px)').matches;

  /** Collapsed rail: slide the full menu out over the page after a short hover. */
  onEnter() {
    if (!this.canHover || !SidebarState.collapsed()) return;
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => SidebarState.peek.set(true), 140);
  }

  onLeave() {
    clearTimeout(this.peekTimer);
    SidebarState.peek.set(false);
  }

  /** Close the hover slide-out; it won't reopen until the mouse leaves and comes back. */
  closePeek() {
    clearTimeout(this.peekTimer);
    SidebarState.peek.set(false);
  }

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        SidebarState.drawer.set(false);
        SidebarState.peek.set(false);
      });
  }
}
