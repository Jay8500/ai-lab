import { Routes } from '@angular/router';
import { labGuard, ownerGuard, rootGuard, superAdminGuard } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.HomePage) },
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
  { path: 'track', loadComponent: () => import('./pages/track/track').then((m) => m.TrackPage) },
  { path: 'track/:token', loadComponent: () => import('./pages/track/track').then((m) => m.TrackPage) },
  {
    path: 'lab',
    canActivate: [labGuard],
    loadComponent: () => import('./lab/lab-shell').then((m) => m.LabShell),
    children: [
      { path: '', loadComponent: () => import('./lab/dashboard/dashboard').then((m) => m.LabDashboard) },
      { path: 'tasks', loadComponent: () => import('./pages/tasks/tasks').then((m) => m.TasksPage) },
      { path: 'reports', loadComponent: () => import('./lab/reports/reports').then((m) => m.LabReports) },
      { path: 'tests', canActivate: [ownerGuard], loadComponent: () => import('./lab/tests/tests').then((m) => m.LabTests) },
      { path: 'profile', loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage) },
      { path: 'security', loadComponent: () => import('./pages/security/security').then((m) => m.SecurityPage) },
      { path: 'account', canActivate: [ownerGuard], loadComponent: () => import('./lab/account/account').then((m) => m.LabAccount) },
    ],
  },
  {
    path: 'admin',
    canActivate: [superAdminGuard],
    loadComponent: () => import('./admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', loadComponent: () => import('./admin/overview/overview').then((m) => m.AdminOverview) },
      { path: 'tasks', loadComponent: () => import('./pages/tasks/tasks').then((m) => m.TasksPage) },
      { path: 'labs', loadComponent: () => import('./admin/labs/labs').then((m) => m.AdminLabs) },
      { path: 'labs/:ref', loadComponent: () => import('./admin/lab-editor/lab-editor').then((m) => m.AdminLabEditor) },
      { path: 'plans', loadComponent: () => import('./admin/plans/plans').then((m) => m.AdminPlans) },
      { path: 'billing', loadComponent: () => import('./admin/billing/billing').then((m) => m.AdminBilling) },
      { path: 'announcements', loadComponent: () => import('./admin/announcements/announcements').then((m) => m.AdminAnnouncements) },
      { path: 'support', loadComponent: () => import('./admin/support/support').then((m) => m.AdminSupport) },
      { path: 'profile', loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage) },
      { path: 'security', loadComponent: () => import('./pages/security/security').then((m) => m.SecurityPage) },
      { path: 'team', canActivate: [rootGuard], loadComponent: () => import('./admin/team/team').then((m) => m.AdminTeam) },
      { path: 'settings', canActivate: [rootGuard], loadComponent: () => import('./admin/settings/settings').then((m) => m.AdminSettings) },
    ],
  },
  { path: '**', redirectTo: '' },
];
