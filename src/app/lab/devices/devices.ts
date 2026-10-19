import { Component, inject } from '@angular/core';
import { TenantService } from '../../core/tenant.service';
import { DevicesManager } from '../../shared/devices-manager';

/** Lab admin: analyzers connected to this lab. */
@Component({
  selector: 'app-lab-devices',
  imports: [DevicesManager],
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Devices</h1>
    <p class="mb-5 text-sm text-slate-500">Connect analyzers so results arrive automatically. Typing results in Results always works too.</p>
    @if (tenant.tenant(); as t) {
      <app-devices-manager [tenantId]="t.id" [catalog]="t.test_catalog" [tokenPrefix]="t.token_prefix || 'LAB'" />
    }
  `,
})
export class LabDevices {
  protected readonly tenant = inject(TenantService);
}
