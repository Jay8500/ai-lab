import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Profile } from './models';
import { rememberStorage, SupabaseService } from './supabase.service';

const LAST_EMAIL_KEY = 'sa_last_email';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService);

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly ready = signal(false);

  readonly isSuperAdmin = computed(() => this.profile()?.role === 'super_admin');
  readonly isLabUser = computed(() => ['lab_owner', 'lab_staff'].includes(this.profile()?.role ?? ''));
  readonly isOwner = computed(() => this.profile()?.role === 'lab_owner');
  readonly displayName = computed(() => this.profile()?.full_name || this.profile()?.email?.split('@')[0] || '');
  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  );

  private initPromise?: Promise<void>;

  init(): Promise<void> {
    this.initPromise ??= (async () => {
      const { data } = await this.sb.client.auth.getSession();
      this.session.set(data.session);
      if (data.session) await this.loadProfile();
      this.sb.client.auth.onAuthStateChange((_evt, session) => {
        this.session.set(session);
        if (!session) this.profile.set(null);
      });
      this.ready.set(true);
    })();
    return this.initPromise;
  }

  get lastEmail(): string {
    try {
      return localStorage.getItem(LAST_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  }

  get rememberMe(): boolean {
    return rememberStorage.remember;
  }

  async signIn(email: string, password: string, remember: boolean): Promise<Profile> {
    rememberStorage.remember = remember;
    try {
      if (remember) localStorage.setItem(LAST_EMAIL_KEY, email);
      else localStorage.removeItem(LAST_EMAIL_KEY);
    } catch {
      /* storage blocked */
    }
    const { data, error } = await this.sb.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
    this.session.set(data.session);
    const profile = await this.loadProfile();
    if (!profile) throw new Error('No profile found for this account');
    return profile;
  }

  async sendReset(email: string): Promise<void> {
    const { error } = await this.sb.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/login?reset=1`,
    });
    if (error) throw new Error(error.message);
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.sb.client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    await this.sb.client.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
  }

  private async loadProfile(): Promise<Profile | null> {
    const uid = (await this.sb.client.auth.getUser()).data.user?.id;
    if (!uid) return null;
    const { data } = await this.sb.client.from('profiles').select('*').eq('id', uid).single();
    this.profile.set((data as Profile) ?? null);
    return this.profile();
  }
}
