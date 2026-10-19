import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

export interface Booking {
  id: string;
  tenant_id: string;
  ref: string;
  patient_name: string;
  mobile: string;
  email: string | null;
  age: number | null;
  gender: 'M' | 'F' | 'O' | null;
  tests: { code: string; name: string; price: number }[];
  amount: number;
  preferred_date: string;
  slot: 'morning' | 'afternoon' | 'evening';
  collection: 'lab' | 'home';
  address: string | null;
  notes: string | null;
  prescription_path: string | null;
  consent_at: string;
  consent_version: string;
  status: 'requested' | 'confirmed' | 'cancelled' | 'completed';
  status_note: string | null;
  visit_id: string | null;
  created_at: string;
}

/** Online booking requests for the signed-in lab (live). */
@Injectable({ providedIn: 'root' })
export class BookingsService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  readonly list = signal<Booking[]>([]);
  readonly loaded = signal(false);
  readonly requested = computed(() => this.list().filter((b) => b.status === 'requested').length);
  private channel?: RealtimeChannel;
  private tenantId: string | null = null;

  constructor() {
    effect(() => {
      const p = this.auth.profile();
      const tid = p && (p.role === 'lab_owner' || p.role === 'lab_staff') ? p.tenant_id : null;
      if (tid && tid !== this.tenantId) void this.start(tid);
      if (!tid && this.tenantId) this.stop();
    });
  }

  private async start(tid: string) {
    this.tenantId = tid;
    await this.load();
    this.channel = this.sb.client
      .channel('bookings-' + tid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_bookings', filter: `tenant_id=eq.${tid}` }, () => void this.load())
      .subscribe();
  }

  private stop() {
    if (this.channel) void this.sb.client.removeChannel(this.channel);
    this.channel = undefined;
    this.tenantId = null;
    this.list.set([]);
  }

  async load() {
    const { data } = await this.sb.client.from('test_bookings').select('*').order('created_at', { ascending: false }).limit(300);
    this.list.set((data ?? []) as Booking[]);
    this.loaded.set(true);
  }

  async setStatus(b: Booking, status: Booking['status'], note?: string | null, visitId?: string) {
    const { error } = await this.sb.client
      .from('test_bookings')
      .update({ status, status_note: note?.trim() || null, ...(visitId ? { visit_id: visitId } : {}) })
      .eq('id', b.id);
    if (error) throw new Error(error.message);
    await this.load();
  }

  async prescriptionUrl(path: string): Promise<string | null> {
    const { data } = await this.sb.client.storage.from('prescriptions').createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  }
}
