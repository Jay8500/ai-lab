import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { LucideAngularModule } from 'lucide-angular';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { TenantService } from './core/tenant.service';
import { APP_ICONS } from './icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
    provideAppInitializer(() => Promise.all([inject(TenantService).init(), inject(AuthService).init()])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
