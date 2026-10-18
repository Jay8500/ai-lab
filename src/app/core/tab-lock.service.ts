import { inject, Injectable, NgZone } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

type Msg = { type: 'probe' | 'owner' | 'takeover'; from: string };

const CHANNEL = 'sa-workspace-tab';
const WAIT_MS = 300;
const isWorkspace = (url: string) => /^\/(lab|admin)(\/|$|\?)/.test(url);

/**
 * One workspace tab per browser. The admin console / lab workspace may be open in only one
 * tab at a time; a duplicated or second tab is sent to the login page (without signing out,
 * because tabs share the same session) where it can take over. Public pages are not limited.
 */
@Injectable({ providedIn: 'root' })
export class TabLockService {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly id = crypto.randomUUID();
  private readonly ch: BroadcastChannel | null = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  /** This tab currently holds the workspace */
  private owner = false;
  private replies = 0;

  constructor() {
    this.ch?.addEventListener('message', (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (!m || m.from === this.id) return;
      if (m.type === 'probe' && this.owner) this.ch!.postMessage({ type: 'owner', from: this.id } satisfies Msg);
      if (m.type === 'owner') this.replies += 1;
      if (m.type === 'takeover' && this.owner) {
        this.owner = false;
        this.zone.run(() => this.router.navigate(['/login'], { queryParams: { tab: 'moved' } }));
      }
    });
    // Leaving the workspace (to a public page or the login page) frees it for other tabs
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      if (!isWorkspace(e.urlAfterRedirects)) this.owner = false;
    });
  }

  /** Called by the workspace guards. Resolves false when another tab already has it open. */
  async claim(): Promise<boolean> {
    if (this.owner || !this.ch) return (this.owner = true);
    this.replies = 0;
    this.ch.postMessage({ type: 'probe', from: this.id } satisfies Msg);
    await new Promise((r) => setTimeout(r, WAIT_MS));
    if (this.replies > 0) return false;
    return (this.owner = true);
  }

  /** "Use this tab instead": the other tab moves to the login page, this one takes the workspace. */
  takeOver() {
    this.ch?.postMessage({ type: 'takeover', from: this.id } satisfies Msg);
    this.owner = true;
  }
}
