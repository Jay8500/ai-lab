import { effect, inject, Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

export interface DeviceSession {
  id: string;
  created_at: string;
  last_active: string;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  mobile: boolean;
}

const KICKED_KEY = 'sa_kicked';
const PING_MS = 20_000;

/** Readable "Chrome on Windows" from a user-agent string. */
export function describeDevice(ua: string | null): DeviceInfo {
  const s = ua ?? '';
  const browser = /Edg\//.test(s) ? 'Edge'
    : /OPR\/|Opera/.test(s) ? 'Opera'
    : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : s ? 'Browser' : 'Unknown browser';
  const os = /Android/.test(s) ? 'Android'
    : /iPhone|iPad|iPod/.test(s) ? 'iOS'
    : /Windows/.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/.test(s) ? 'macOS'
    : /Linux/.test(s) ? 'Linux'
    : 'Unknown OS';
  return { browser, os, mobile: /Android|iPhone|iPad|Mobile/.test(s) };
}

/**
 * Device sessions for the signed-in account:
 *  - lists / revokes sessions (Account security page, sign-in prompt)
 *  - watches the current session and signs this browser out the moment another
 *    device removes it (instant push via Realtime, plus a 20s heartbeat as backup)
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  private timer?: ReturnType<typeof setInterval>;
  private channel?: RealtimeChannel;
  private watchingUser: string | null = null;
  private kicking = false;
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.check();
  };

  constructor() {
    effect(() => {
      const uid = this.auth.session()?.user.id ?? null;
      if (uid && uid !== this.watchingUser) this.start(uid);
      if (!uid && this.watchingUser) {
        this.stop();
        // Session vanished without the user pressing Sign out → it was revoked elsewhere
        if (!this.auth.signingOut) this.kicked();
      }
    });
  }

  async list(): Promise<DeviceSession[]> {
    const { data, error } = await this.sb.client.rpc('my_sessions');
    if (error) throw error;
    return (data ?? []) as DeviceSession[];
  }

  async revoke(id: string): Promise<void> {
    const { error } = await this.sb.client.rpc('revoke_my_session', { p_session: id });
    if (error) throw error;
    this.broadcast();
  }

  async revokeOthers(): Promise<number> {
    const { data, error } = await this.sb.client.rpc('revoke_other_sessions');
    if (error) throw error;
    this.broadcast();
    return (data as number) ?? 0;
  }

  /** Shown once on the login page after this browser was signed out remotely. */
  consumeKickedNotice(): boolean {
    try {
      const v = sessionStorage.getItem(KICKED_KEY) === '1';
      sessionStorage.removeItem(KICKED_KEY);
      return v;
    } catch {
      return false;
    }
  }

  private start(uid: string) {
    this.stop();
    this.watchingUser = uid;
    this.check();
    this.timer = setInterval(() => this.check(), PING_MS);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
    this.channel = this.sb.client
      .channel(`acct-${uid}`)
      .on('broadcast', { event: 'revoked' }, () => this.check())
      .subscribe();
  }

  private stop() {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
    if (this.channel) this.sb.client.removeChannel(this.channel);
    this.channel = undefined;
    this.watchingUser = null;
  }

  /** Tell the account's other open devices to re-check right away. */
  private broadcast() {
    this.channel?.send({ type: 'broadcast', event: 'revoked', payload: {} });
  }

  private async check() {
    if (!this.auth.session() || this.kicking) return;
    const { data, error } = await this.sb.client.rpc('session_ping');
    // Network errors are not a reason to sign anyone out — only an explicit "no"
    if (!error && data === false) this.kicked();
  }

  private async kicked() {
    if (this.kicking) return;
    this.kicking = true;
    this.stop();
    try {
      sessionStorage.setItem(KICKED_KEY, '1');
    } catch {
      /* storage blocked */
    }
    await this.auth.signOut();
    this.kicking = false;
    this.zone.run(() => this.router.navigateByUrl('/login'));
  }
}
