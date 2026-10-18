import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../core/auth.service';
import { LabService } from '../core/lab.service';
import { SupportService } from '../core/support.service';
import { TaskService } from '../core/task.service';
import { TenantService } from '../core/tenant.service';
import { ToastService } from '../core/toast.service';
import { AddPatientModal } from '../shared/add-patient-modal';
import { BrandMark } from '../shared/brand-mark';
import { CirclesLogo } from '../shared/circles-logo';
import { AnnouncementBanner, AnnouncementReader } from '../shared/inbox-ui';
import { PatientHistory } from '../shared/patient-history';
import { AiExplanation } from '../shared/ai-explanation';
import { CirclesSupport } from '../shared/circles-support-modal';
import { NavItem, Sidebar, SidebarState } from '../shared/sidebar';
import { TenantHeader } from '../shared/tenant-header';

@Component({
  selector: 'app-lab-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, DatePipe, TenantHeader, AddPatientModal, CirclesSupport, Sidebar, BrandMark, CirclesLogo, AnnouncementBanner, AnnouncementReader, PatientHistory, AiExplanation],
  template: `
    @let mini = sidebar.compact();
    <app-sidebar [items]="nav()" heading="Workspace">
      <a sidebar-brand routerLink="/lab" class="flex min-w-0 items-center gap-2.5">
        <img [src]="tenant.logo()" alt="" class="size-9 shrink-0 rounded-xl bg-white object-contain ring-1 ring-slate-100" />
        <span class="min-w-0 leading-tight">
          <span class="block truncate text-[15px] font-bold text-slate-800">{{ tenant.name() }}</span>
          <span class="block truncate font-mono text-[11px] text-slate-400">{{ tenant.slug() }}.spreadapps.in</span>
        </span>
      </a>
      <img sidebar-mark [src]="tenant.logo()" alt="" class="size-9 rounded-xl bg-white object-contain ring-1 ring-slate-100" />

      <div sidebar-footer class="space-y-3">
        @if (!mini) {
          <button class="btn-primary w-full" (click)="lab.addOpen.set(true)"><lucide-icon name="user-plus" class="size-4" /> Add patient</button>
        }
        @if (tenant.pages().show_support) {
          @if (mini) {
            <button class="nav-link hidden w-full justify-center md:flex" (click)="support.open.set(true)" title="Need help? Raise ticket">
              <app-circles-logo [size]="20" />
            </button>
          } @else {
            <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 to-teal-500 p-4 text-white">
              <div class="absolute -top-6 -right-6 size-20 rounded-full bg-white/10"></div>
              <div class="absolute -right-2 -bottom-8 size-16 rounded-full bg-white/10"></div>
              <span class="relative grid size-9 place-items-center rounded-xl bg-white"><app-circles-logo [size]="22" /></span>
              <p class="relative mt-2 text-sm font-bold">Need help?</p>
              <p class="relative text-[11px] text-white/80">Raise a ticket — powered by Circles</p>
              <button class="relative mt-3 w-full rounded-xl bg-white/95 py-2 text-xs font-bold text-teal-700 transition hover:bg-white" (click)="support.open.set(true)">
                Raise ticket
              </button>
            </div>
          }
        }
        <button class="nav-link w-full bg-rose-50 text-rose-600 ring-1 ring-rose-100 hover:bg-rose-500 hover:text-white hover:ring-rose-500" [class]="{ 'md:justify-center': mini, 'md:px-0': mini }"
                (click)="signOut()" title="Sign out" aria-label="Sign out">
          <lucide-icon name="log-out" class="size-[18px] shrink-0" />
          <span [class]="{ 'md:hidden': mini }">Sign out</span>
        </button>
        @if (!mini && tenant.pages().show_powered_by !== false) {
          <div class="flex justify-center pt-1"><app-brand-mark /></div>
        }
      </div>
    </app-sidebar>

    <div class="min-h-dvh bg-slate-50/50 pb-24 transition-[padding] duration-300 md:pb-10" [class]="sidebar.collapsed() ? 'md:pl-[76px]' : 'md:pl-64'">
      <app-tenant-header (addPatient)="lab.addOpen.set(true)" />
      <app-announcement-banner />

      @if (tenant.tenant(); as t) {
        @if (!t.usable) {
          <div class="border-b border-rose-100 bg-rose-50">
            <div class="flex items-center gap-3 px-4 py-2.5 text-sm text-rose-700 sm:px-6">
              <lucide-icon name="lock" class="size-4 shrink-0" />
              @if (t.block_reason === 'payment_overdue') {
                <span>An invoice is overdue — new patients and uploads are paused until it’s paid.</span>
                @if (auth.isOwner()) {
                  <a routerLink="/lab/account" class="ml-auto shrink-0 rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700">Pay now</a>
                } @else {
                  <span class="ml-auto shrink-0 text-xs">Ask your lab admin to pay.</span>
                }
              } @else {
                <span>{{ t.status === 'trial' || t.status === 'expired' ? 'Your free trial has ended' : 'Your subscription is ' + t.status }} — new patients and uploads are paused. Contact SpreadApps to continue.</span>
              }
            </div>
          </div>
        } @else if (tenant.trialDaysLeft() !== null) {
          <div class="border-b border-amber-100 bg-amber-50/70">
            <div class="flex items-center gap-3 px-4 py-2 text-xs text-amber-700 sm:px-6">
              <lucide-icon name="hourglass" class="size-3.5 shrink-0" />
              <span><b>{{ tenant.trialDaysLeft() }} day(s)</b> left in your free trial (ends {{ t.trial_ends_at | date: 'MMM d' }}).</span>
              @if (auth.isOwner()) {
                <a routerLink="/lab/account" class="ml-auto font-semibold underline-offset-2 hover:underline">View plan</a>
              }
            </div>
          </div>
        }
      }

      <main class="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-7">
        <router-outlet />
      </main>

      <!-- Mobile: bottom navigation -->
      <nav class="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 backdrop-blur md:hidden">
        <div class="grid grid-cols-4 px-2 pt-1.5 pb-1.5">
          <a routerLink="/lab" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="!text-brand" class="flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-slate-400">
            <lucide-icon name="layout-dashboard" class="size-5" /> Dashboard
          </a>
          <button class="flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-slate-400" (click)="lab.addOpen.set(true)">
            <span class="-mt-5 grid size-11 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30"><lucide-icon name="user-plus" class="size-5" /></span>
            Add patient
          </button>
          <a routerLink="/lab/reports" routerLinkActive="!text-brand" class="flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-slate-400">
            <lucide-icon name="search" class="size-5" /> Reports
          </a>
          <button class="flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold text-slate-400" (click)="support.open.set(true)">
            <app-circles-logo [size]="20" /> Support
          </button>
        </div>
      </nav>
    </div>

    @if (lab.addOpen()) {
      <app-add-patient-modal (closed)="lab.addOpen.set(false)" />
    }
    <app-circles-support />
    <app-announcement-reader />
    <app-patient-history />
    <app-ai-explanation />
  `,
})
export class LabShell implements OnInit {
  protected readonly lab = inject(LabService);
  protected readonly tenant = inject(TenantService);
  protected readonly support = inject(SupportService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly sidebar = SidebarState;
  private readonly tasks = inject(TaskService);
  private readonly router = inject(Router);

  protected readonly nav = computed<NavItem[]>(() => [
    { path: '/lab', label: 'Dashboard', icon: 'layout-dashboard', exact: true },
    { path: '/lab/tasks', label: 'Tasks', icon: 'list-todo', badge: this.tasks.myDueCount() || undefined },
    { path: '/lab/reports', label: 'Reports', icon: 'file-text', badge: this.lab.kpis().ready || undefined },
    ...(this.tenant.pages().show_ai !== false ? [{ path: '/lab/assistant', label: 'Ask AI', icon: 'bot' }] : []),
    ...(this.auth.isOwner()
      ? [
          { path: '/lab/tests', label: 'Tests & prices', icon: 'test-tube' },
          { path: '/lab/account', label: 'Plan & team', icon: 'settings' },
        ]
      : []),
    { path: '/lab/activity', label: 'Activity', icon: 'history' },
    { path: '/lab/help', label: 'Help & feedback', icon: 'book-open' },
  ]);

  async signOut() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }

  async ngOnInit() {
    this.tasks.load().catch(() => undefined); // for the menu badge
    try {
      await this.lab.load();
    } catch (e) {
      this.toast.fail(e);
    }
  }
}
