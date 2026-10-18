import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';

/**
 * PWA: the service worker keeps serving the old build until a reload. When a new
 * version has been downloaded, offer a one-click update (checked on focus and every 15 min).
 */
@Component({
  selector: 'app-update-banner',
  imports: [LucideAngularModule],
  template: `
    @if (ready()) {
      <div class="animate-fade-up fixed inset-x-3 bottom-20 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl md:bottom-6">
        <lucide-icon name="sparkles" class="size-4 shrink-0 text-amber-300" />
        <span class="flex-1">A new version of the app is ready.</span>
        <button class="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100" (click)="reload()">Update now</button>
        <button class="text-white/60 hover:text-white" (click)="ready.set(false)" aria-label="Later"><lucide-icon name="x" class="size-4" /></button>
      </div>
    }
  `,
})
export class UpdateBanner {
  private readonly sw = inject(SwUpdate);
  private readonly doc = inject(DOCUMENT);
  protected readonly ready = signal(false);

  constructor() {
    if (!this.sw.isEnabled) return;
    this.sw.versionUpdates.pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY')).subscribe(() => this.ready.set(true));
    this.sw.unrecoverable.subscribe(() => this.doc.location.reload());
    const check = () => this.sw.checkForUpdate().catch(() => undefined);
    setInterval(check, 15 * 60_000);
    this.doc.addEventListener('visibilitychange', () => this.doc.visibilityState === 'visible' && check());
  }

  async reload() {
    await this.sw.activateUpdate().catch(() => undefined);
    this.doc.location.reload();
  }
}
