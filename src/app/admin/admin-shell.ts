import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../environments/environment';
import { AdminService } from '../core/admin.service';
import { AuthService } from '../core/auth.service';
import { TaskService } from '../core/task.service';
import { ToastService } from '../core/toast.service';
import { Avatar } from '../shared/avatar';
import { NavItem, Sidebar, SidebarState } from '../shared/sidebar';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, LucideAngularModule, Sidebar, Avatar],
  template: `
    @let mini = sidebar.compact();
    <app-sidebar [items]="nav()" heading="Console">
      <a sidebar-brand routerLink="/admin" class="flex items-center gap-2.5">
        <img [src]="brand.logo" alt="" class="size-8" />
        <span class="leading-tight">
          <span class="block font-extrabold tracking-tight text-slate-800">{{ brand.name }}</span>
          <span class="block text-[11px] font-semibold text-brand">{{ brand.product }} · Admin</span>
        </span>
      </a>
      <img sidebar-mark [src]="brand.logo" alt="" class="size-8" />

      <div sidebar-footer>
        <div class="flex items-center gap-3 rounded-xl px-1 py-1" [class]="{ 'md:flex-col': mini, 'md:gap-4': mini }">
          <a routerLink="/admin/profile" class="flex min-w-0 flex-1 items-center gap-3 rounded-xl transition hover:opacity-80" [class]="{ 'md:justify-center': mini }" title="My profile">
            <app-avatar [name]="auth.displayName()" [url]="auth.profile()?.avatar_url" [size]="36" />
            <div class="min-w-0 flex-1" [class]="{ 'md:hidden': mini }">
              <p class="truncate text-sm font-semibold text-slate-700">{{ auth.displayName() }}</p>
              <p class="truncate text-[11px] text-slate-400">{{ auth.profile()?.username || auth.roleLabel() }}</p>
            </div>
          </a>
          <button class="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 transition hover:bg-rose-500 hover:text-white hover:ring-rose-500"
                  (click)="signOut()" title="Sign out" aria-label="Sign out">
            <lucide-icon name="log-out" class="size-4" />
          </button>
        </div>
      </div>
    </app-sidebar>

    <div class="min-h-dvh bg-slate-50/50 transition-[padding] duration-300" [class]="sidebar.collapsed() ? 'md:pl-[76px]' : 'md:pl-64'">
      <!-- Mobile top bar -->
      <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-100 bg-white/90 px-4 backdrop-blur md:hidden">
        <button class="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" (click)="sidebar.drawer.set(true)" aria-label="Menu"><lucide-icon name="menu" class="size-5" /></button>
        <img [src]="brand.logo" alt="" class="size-7" />
        <p class="font-bold text-slate-800">{{ brand.product }} Admin</p>
      </header>

      <main class="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AdminShell implements OnInit {
  protected readonly admin = inject(AdminService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly brand = environment.brand;
  protected readonly sidebar = SidebarState;
  private readonly tasks = inject(TaskService);

  protected readonly nav = computed<NavItem[]>(() => [
    { path: '/admin', label: 'Overview', icon: 'layout-dashboard', exact: true },
    { path: '/admin/labs', label: 'Labs (clients)', icon: 'building-2' },
    { path: '/admin/tasks', label: 'Tasks', icon: 'list-todo', badge: this.tasks.myDueCount() || undefined },
    { path: '/admin/plans', label: 'Plans & pricing', icon: 'wallet' },
    { path: '/admin/billing', label: 'Billing', icon: 'receipt' },
    { path: '/admin/announcements', label: 'Announcements', icon: 'megaphone' },
    { path: '/admin/support', label: 'Support · Circles', icon: 'life-buoy', img: 'brand/circles-logo.svg', badge: this.admin.totals().tickets || undefined },
    ...(this.auth.isRoot()
      ? [
          { path: '/admin/team', label: 'SpreadApps team', icon: 'users' },
          { path: '/admin/settings', label: 'Platform settings', icon: 'settings' },
        ]
      : []),
    { path: '/admin/activity', label: 'Activity', icon: 'history' },
    { path: '/admin/help', label: 'Help & feedback', icon: 'book-open' },
  ]);

  async ngOnInit() {
    this.tasks.load().catch(() => undefined); // for the menu badge
    try {
      await this.admin.loadAll();
    } catch (e) {
      this.toast.fail(e);
    }
  }

  async signOut() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
