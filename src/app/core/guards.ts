import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { TenantService } from './tenant.service';

/** Admin console: super admins only, and only on the platform host (never inside a lab's site). */
export const superAdminGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(AuthService);
  const tenant = inject(TenantService);
  const router = inject(Router);
  await auth.init();
  if (tenant.tenant()) {
    location.href = tenant.platformUrl('/admin');
    return false;
  }
  if (auth.isPlatformAdmin()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Lab workspace: only owner/staff of the lab this host belongs to. */
export const labGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(AuthService);
  const tenant = inject(TenantService);
  const router = inject(Router);
  await auth.init();
  const t = tenant.tenant();
  if (!t) return router.createUrlTree(['/']);
  if (auth.isLabUser() && auth.profile()?.tenant_id === t.id) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Platform team & settings: the SpreadApps owner only. */
export const rootGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isRoot() ? true : router.createUrlTree(['/admin']);
};

/** Plan, billing and team: lab owner only. */
export const ownerGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isOwner() ? true : router.createUrlTree(['/lab']);
};
