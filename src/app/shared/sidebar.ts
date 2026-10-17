import { Component, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter } from 'rxjs';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
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
export const SidebarState = {
  drawer: signal(false),
  collapsed: signal(readCollapsed()),
  toggleCollapsed() {
    const v = !SidebarState.collapsed();
    SidebarState.collapsed.set(v);
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
    @let mini = state.collapsed();
    @if (state.drawer()) {
      <div class="animate-fade-in fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] md:hidden" (click)="state.drawer.set(false)"></div>
    }
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-100 bg-white transition-all duration-300 md:translate-x-0"
      [class]="{ '-translate-x-full': !state.drawer(), 'md:w-[76px]': mini }"
    >
      <div class="flex h-16 shrink-0 items-center gap-2 px-4" [class]="{ 'md:justify-center md:px-0': mini }">
        <div class="min-w-0 flex-1" [class]="{ 'md:hidden': mini }"><ng-content select="[sidebar-brand]" /></div>
        <div class="hidden" [class]="{ 'md:block': mini }"><ng-content select="[sidebar-mark]" /></div>
        <button class="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" [class]="{ 'md:block': !mini }"
                (click)="state.toggleCollapsed()" title="Collapse menu">
          <lucide-icon name="panel-left-close" class="size-[18px]" />
        </button>
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
             class="nav-link relative" [class]="{ 'md:justify-center md:px-0': mini }" [title]="n.label">
            <lucide-icon [name]="n.icon" class="size-[18px] shrink-0" />
            <span class="truncate" [class]="{ 'md:hidden': mini }">{{ n.label }}</span>
            @if (n.badge) {
              <span class="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white" [class]="{ 'md:absolute md:top-1 md:right-2': mini }">{{ n.badge }}</span>
            }
          </a>
        }
        @if (mini) {
          <button class="nav-link hidden w-full justify-center md:flex" (click)="state.toggleCollapsed()" title="Expand menu">
            <lucide-icon name="panel-left-open" class="size-[18px]" />
          </button>
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

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => SidebarState.drawer.set(false));
  }
}
