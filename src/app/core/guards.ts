import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { TenantService } from './tenant.service';

export const superAdminGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  if (auth.isSuperAdmin()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Lab users may only enter the lab whose host/slug they belong to (super admin may enter any). */
export const labGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(AuthService);
  const tenant = inject(TenantService);
  const router = inject(Router);
  await auth.init();
  const t = tenant.tenant();
  if (!t) return router.createUrlTree(['/']);
  if (auth.isSuperAdmin()) return true;
  if (auth.isLabUser() && auth.profile()?.tenant_id === t.id) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};
