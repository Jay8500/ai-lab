import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

interface CirclesSettings {
  enabled: boolean;
  api_url: string;
  project_id: string;
  note?: string;
}

interface BrandSettings {
  name: string;
  product: string;
  support_email: string;
  base_domain: string;
}

@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight text-slate-900">Platform settings</h1>
    <p class="text-sm text-slate-500">Defaults for the whole AI-Lab platform.</p>

    <div class="mt-5 grid gap-5 lg:grid-cols-2">
      <form class="card space-y-4 p-5 sm:p-6" (ngSubmit)="saveCircles()">
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-600"><lucide-icon name="life-buoy" class="size-5" /></span>
          <div><h2 class="section-title">Circles ticketing</h2><p class="text-xs text-slate-400">Where in-app support tickets are forwarded.</p></div>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" class="size-4 accent-[var(--brand)]" name="en" [(ngModel)]="circles.enabled" /> Show support widget to labs</label>
        <div><label class="label">Circles API / webhook URL</label><input class="input font-mono text-xs" name="u" [(ngModel)]="circles.api_url" placeholder="https://yytcmotbgccpbyvheakn.supabase.co/functions/v1/…" /></div>
        <div><label class="label">Default Circles project ID</label><input class="input font-mono text-xs" name="p" [(ngModel)]="circles.project_id" /></div>
        <p class="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          Tickets are always saved here first (Admin → Support). Per-lab Circles project/API keys live under each lab's <b>API keys</b> tab and override this default.
        </p>
        <button class="btn-primary" type="submit"><lucide-icon name="save" class="size-4" /> Save</button>
      </form>

      <form class="card space-y-4 p-5 sm:p-6" (ngSubmit)="saveBrand()">
        <div class="flex items-center gap-3">
          <img [src]="logo" alt="" class="size-10" />
          <div><h2 class="section-title">SpreadApps brand</h2><p class="text-xs text-slate-400">Shown on the platform landing and “Powered by”.</p></div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label">Company</label><input class="input" name="n" [(ngModel)]="brand.name" /></div>
          <div><label class="label">Product</label><input class="input" name="p" [(ngModel)]="brand.product" /></div>
          <div><label class="label">Support email</label><input class="input" name="e" [(ngModel)]="brand.support_email" /></div>
          <div><label class="label">Base domain</label><input class="input font-mono" name="d" [(ngModel)]="brand.base_domain" /></div>
        </div>
        <button class="btn-primary" type="submit"><lucide-icon name="save" class="size-4" /> Save</button>
      </form>

      <form class="card space-y-4 p-5 sm:p-6" (ngSubmit)="changePw()">
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand"><lucide-icon name="lock" class="size-5" /></span>
          <div><h2 class="section-title">Your password</h2><p class="text-xs text-slate-400">Signed in as {{ auth.profile()?.email }}</p></div>
        </div>
        <input class="input" type="password" name="pw" [(ngModel)]="pw" placeholder="New password (8+ characters)" autocomplete="new-password" minlength="8" />
        <button class="btn-primary" type="submit" [disabled]="pw.length < 8"><lucide-icon name="key-round" class="size-4" /> Update password</button>
      </form>
    </div>
  `,
})
export class AdminSettings implements OnInit {
  private readonly admin = inject(AdminService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly logo = environment.brand.logo;
  protected circles: CirclesSettings = { enabled: true, api_url: '', project_id: '' };
  protected brand: BrandSettings = { name: 'SpreadApps', product: 'AI-Lab', support_email: '', base_domain: environment.baseDomain };
  protected pw = '';
  protected readonly loaded = signal(false);

  async ngOnInit() {
    this.circles = { ...this.circles, ...((await this.admin.setting<CirclesSettings>('circles')) ?? {}) };
    this.brand = { ...this.brand, ...((await this.admin.setting<BrandSettings>('brand')) ?? {}) };
    this.loaded.set(true);
  }

  async saveCircles() {
    await this.run(() => this.admin.saveSetting('circles', this.circles));
  }

  async saveBrand() {
    await this.run(() => this.admin.saveSetting('brand', this.brand));
  }

  async changePw() {
    await this.run(() => this.auth.updatePassword(this.pw));
    this.pw = '';
  }

  private async run(fn: () => Promise<unknown>) {
    try {
      await fn();
      this.toast.success('Saved');
    } catch (e) {
      this.toast.error((e as Error).message);
    }
  }
}
