import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

const REMEMBER_KEY = 'sa_remember';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * "Remember me" storage: the session lives in localStorage when the user asked to be
 * remembered, otherwise in sessionStorage (cleared when the browser closes).
 */
export const rememberStorage = {
  get remember(): boolean {
    return safe(() => localStorage.getItem(REMEMBER_KEY) !== '0', true);
  },
  set remember(v: boolean) {
    safe(() => localStorage.setItem(REMEMBER_KEY, v ? '1' : '0'), undefined);
  },
  getItem(key: string): string | null {
    return safe(() => sessionStorage.getItem(key) ?? localStorage.getItem(key), null);
  },
  setItem(key: string, value: string): void {
    safe(() => {
      if (rememberStorage.remember) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    }, undefined);
  },
  removeItem(key: string): void {
    safe(() => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }, undefined);
  },
};

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { storage: rememberStorage, persistSession: true, autoRefreshToken: true, storageKey: 'sa-lab-auth' },
  });

  publicUrl(bucket: string, path: string): string {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}
