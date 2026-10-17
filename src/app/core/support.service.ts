import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

export interface TicketInput {
  summary: string;
  details: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  screenshot: File | null;
}

/**
 * Circles support bridge. Tickets are stored in this project's support_tickets table
 * (tenant context attached) so they are never lost; the super admin sees them in
 * Admin → Support, and a Circles sync (edge function / webhook) can push them on.
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly tenant = inject(TenantService);

  readonly open = signal(false);

  async submit(input: TicketInput): Promise<string> {
    const tenantId = this.tenant.tenant()?.id ?? null;
    const uid = this.auth.profile()?.id;
    if (!uid) throw new Error('Please sign in to raise a ticket');

    let screenshot_path: string | null = null;
    if (input.screenshot) {
      const ext = input.screenshot.name.split('.').pop()?.toLowerCase() || 'png';
      screenshot_path = `${tenantId ?? 'platform'}/${crypto.randomUUID()}.${ext}`;
      const { error } = await this.sb.client.storage
        .from('support')
        .upload(screenshot_path, input.screenshot, { contentType: input.screenshot.type });
      if (error) throw new Error(`Screenshot upload failed: ${error.message}`);
    }

    const { data, error } = await this.sb.client
      .from('support_tickets')
      .insert({
        tenant_id: tenantId,
        created_by: uid,
        reporter_email: this.auth.profile()?.email,
        summary: input.summary,
        details: `${input.details}\n\n— context: lab=${this.tenant.slug() ?? 'platform'}, ua=${navigator.userAgent}`,
        priority: input.priority,
        screenshot_path,
        page_url: location.href,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data.id as string).slice(0, 8).toUpperCase();
  }
}
