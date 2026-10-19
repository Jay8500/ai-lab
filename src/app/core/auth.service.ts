import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { initialsOf, Profile, ROLE_LABELS } from './models';
import { rememberStorage, SupabaseService } from './supabase.service';
import { cleanText } from './text-clean';
import { environment } from '../../environments/environment';

const LAST_EMAIL_KEY = 'sa_last_email';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService);

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly ready = signal(false);

  /** SpreadApps owner — manages platform admins and platform settings. */
  readonly isRoot = computed(() => this.profile()?.role === 'super_admin');
  /** Any SpreadApps admin (owner or team) — the admin console. */
  readonly isPlatformAdmin = computed(() => ['super_admin', 'platform_admin'].includes(this.profile()?.role ?? ''));
  readonly isLabUser = computed(() => ['lab_owner', 'lab_staff'].includes(this.profile()?.role ?? ''));
  readonly roleLabel = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return p.role === 'lab_staff' && p.title ? p.title : ROLE_LABELS[p.role];
  });
  readonly isOwner = computed(() => this.profile()?.role === 'lab_owner');
  /** Signed in with Google from a lab's patient portal (no workspace access). */
  readonly isPatient = computed(() => this.profile()?.role === 'patient');
  readonly displayName = computed(() => this.profile()?.full_name || this.profile()?.username || '');
  readonly initials = computed(() => initialsOf(this.displayName()));

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

  /**
   * Google sign-in. Patients get a patient account; staff and admins sign in to their existing
   * account when the Google email matches it (Supabase links the two). Returns to `next` on this site.
   */
  /** Whether Google sign-in is switched on in Supabase (buttons stay hidden until it is). */
  readonly googleEnabled = signal(false);
  private googleChecked = false;
  checkGoogle(): void {
    if (this.googleChecked) return;
    this.googleChecked = true;
    fetch(environment.supabaseUrl + '/auth/v1/settings', { headers: { apikey: environment.supabaseAnonKey } })
      .then((r) => r.json())
      .then((s) => this.googleEnabled.set(s?.external?.google === true))
      .catch(() => undefined);
  }

  async signInWithGoogle(next: string): Promise<void> {
    rememberStorage.remember = true;
    const { error } = await this.sb.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + next, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw new Error(/provider is not enabled|Unsupported provider/i.test(error.message) ? 'Google sign-in isn’t switched on yet — please use your username and password.' : error.message);
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

  /**
   * Sign in with an email or a username. A username is only looked up on the site it
   * belongs to (labSlug = this lab, null = SpreadApps admin), so another lab's usernames
   * don't resolve here at all.
   */
  async signIn(identifier: string, password: string, remember: boolean, labSlug: string | null): Promise<Profile> {
    rememberStorage.remember = remember;
    try {
      if (remember) localStorage.setItem(LAST_EMAIL_KEY, identifier);
      else localStorage.removeItem(LAST_EMAIL_KEY);
    } catch {
      /* storage blocked */
    }
    let email = identifier.trim();
    if (!email.includes('@')) {
      const { data: found } = await this.sb.client.rpc('resolve_login', { p_username: email, p_slug: labSlug });
      if (!found) throw new Error('Wrong username or password.');
      email = found as string;
    }
    const { data, error } = await this.sb.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong username or password.' : error.message);
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

  /** Name + photo only; role, lab and username can't be changed by the user. */
  async updateProfile(fullName: string, avatarUrl: string | null): Promise<void> {
    const { error } = await this.sb.client.rpc('update_my_profile', { p_full_name: cleanText(fullName), p_avatar_url: avatarUrl?.trim() || null });
    if (error) throw error;
    await this.loadProfile();
  }

  async uploadAvatar(file: File): Promise<string> {
    const uid = this.profile()?.id;
    if (!uid) throw new Error('Not signed in');
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${uid}/avatar-${Date.now()}.${ext}`;
    const { error } = await this.sb.client.storage.from('avatars').upload(path, file, { contentType: file.type });
    if (error) throw error;
    return this.sb.publicUrl('avatars', path);
  }

  /** True while a sign-out started by this browser is in progress (not a remote revoke). */
  signingOut = false;

  /** Signs out THIS device only — other devices are managed under Account security. */
  async signOut(): Promise<void> {
    this.signingOut = true;
    // record before the session ends (needs the token)
    await this.sb.client.rpc('log_event', { p_action: 'signed_out' }).then(
      () => undefined,
      () => undefined,
    );
    try {
      await this.sb.client.auth.signOut({ scope: 'local' });
    } catch {
      /* session may already be revoked server-side; local sign-out still happens */
    }
    this.session.set(null);
    this.profile.set(null);
    this.signingOut = false;
  }

  private async loadProfile(): Promise<Profile | null> {
    const uid = (await this.sb.client.auth.getUser()).data.user?.id;
    if (!uid) return null;
    const { data } = await this.sb.client.from('profiles').select('*').eq('id', uid).single();
    this.profile.set((data as Profile) ?? null);
    return this.profile();
  }
}
