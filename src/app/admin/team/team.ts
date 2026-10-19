import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { TeamManager } from '../../shared/team-manager';

/** Super admin only: the Spread Apps team who can run the admin console. */
@Component({
  selector: 'app-admin-team',
  imports: [LucideAngularModule, TeamManager],
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Spread Apps team</h1>
    <p class="text-sm text-slate-500">Platform admins can create labs and their first lab admin, manage plans, billing and support.</p>

    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      @for (r of rules; track r.t) {
        <div class="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4">
          <lucide-icon [name]="r.icon" class="mt-0.5 size-4 shrink-0 text-brand" />
          <p class="text-xs text-slate-500"><b class="block text-sm text-slate-700">{{ r.t }}</b>{{ r.d }}</p>
        </div>
      }
    </div>

    <div class="mt-5">
      <app-team-manager scope="platform" heading="Platform admins" [signInHint]="host + '/login'" emptyText="Only you so far." />
    </div>
  `,
})
export class AdminTeam {
  protected readonly host = environment.platformHost;
  protected readonly rules = [
    { icon: 'shield-check', t: 'You (super admin)', d: 'Everything, plus this team and platform settings.' },
    { icon: 'users', t: 'Platform admins', d: 'Labs, branding, API keys, plans, billing, lab admins, support.' },
    { icon: 'building-2', t: 'Lab admins', d: 'Run their own lab and create their own staff on their subdomain.' },
  ];
}
