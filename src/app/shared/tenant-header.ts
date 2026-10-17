import { DatePipe } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../core/auth.service';
import { LabService } from '../core/lab.service';
import { TenantService } from '../core/tenant.service';
import { SidebarState } from './sidebar';

const ROLE_LABEL = { super_admin: 'SpreadApps admin', lab_owner: 'Lab owner', lab_staff: 'Reception / staff' };

/** Top bar of the lab workspace (navigation lives in the sidebar). */
@Component({
  selector: 'app-tenant-header',
  imports: [LucideAngularModule, RouterLink, DatePipe],
  template: `
    <header class="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur-md">
      <div class="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button class="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" (click)="sidebar.drawer.set(true)" aria-label="Open menu">
          <lucide-icon name="menu" class="size-5" />
        </button>
        <a routerLink="/lab" class="flex min-w-0 items-center gap-2 md:hidden">
          <img [src]="tenant.logo()" alt="" class="size-8 shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-100" />
          <span class="truncate text-sm font-bold text-slate-800">{{ tenant.name() }}</span>
        </a>

        <div class="hidden items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2 text-xs md:flex">
          <span class="text-slate-500">Today <b class="ml-1 text-slate-800">{{ lab.kpis().tokens }}</b></span>
          <span class="h-3 w-px bg-slate-200"></span>
          <span class="text-slate-500">Processing <b class="ml-1 text-amber-600">{{ lab.kpis().processing }}</b></span>
          <span class="h-3 w-px bg-slate-200"></span>
          <span class="text-slate-500">Ready <b class="ml-1 text-emerald-600">{{ lab.kpis().ready }}</b></span>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <span class="hidden items-center gap-1.5 rounded-xl border border-slate-100 px-3 py-2 text-xs font-medium text-slate-600 lg:flex">
            <lucide-icon name="calendar" class="size-3.5" /> {{ today | date: 'MMMM d, y' }}
          </span>
          <button class="btn-primary hidden !py-2 md:inline-flex" (click)="addPatient.emit()">
            <lucide-icon name="plus" class="size-4" /> New patient
          </button>

          <div class="relative">
            <button class="flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition hover:bg-slate-100 sm:pr-3" (click)="menu.set(!menu())" aria-label="Account menu">
              <span class="grid size-9 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">{{ auth.initials() || 'U' }}</span>
              <span class="hidden text-left leading-tight sm:block">
                <span class="block max-w-32 truncate text-sm font-semibold text-slate-700">{{ auth.displayName() }}</span>
                <span class="block text-[11px] text-slate-400">{{ roleLabel() }}</span>
              </span>
            </button>
            @if (menu()) {
              <div class="fixed inset-0 z-40" (click)="menu.set(false)"></div>
              <div class="animate-fade-up absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-slate-100 bg-white p-2 shadow-lg">
                <div class="px-3 py-2">
                  <p class="truncate text-sm font-semibold text-slate-800">{{ auth.displayName() }}</p>
                  <p class="truncate text-xs text-slate-400">{{ auth.profile()?.email }}</p>
                </div>
                @if (auth.isOwner()) {
                  <a routerLink="/lab/account" (click)="menu.set(false)" class="nav-link"><lucide-icon name="settings" class="size-4" /> Plan & team</a>
                }
                <button class="nav-link w-full text-rose-600 hover:bg-rose-50 hover:text-rose-700" (click)="signOut()">
                  <lucide-icon name="log-out" class="size-4" /> Sign out
                </button>
              </div>
            }
          </div>
        </div>
      </div>
    </header>
  `,
})
export class TenantHeader {
  protected readonly tenant = inject(TenantService);
  protected readonly auth = inject(AuthService);
  protected readonly lab = inject(LabService);
  private readonly router = inject(Router);
  protected readonly sidebar = SidebarState;
  readonly addPatient = output<void>();
  protected readonly menu = signal(false);
  protected readonly today = new Date();
  protected readonly roleLabel = computed(() => ROLE_LABEL[this.auth.profile()?.role ?? 'lab_staff']);

  async signOut() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
