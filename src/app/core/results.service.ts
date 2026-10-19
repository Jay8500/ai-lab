import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LabService } from './lab.service';
import { ReportValue, ResultValue, TestItem, TestResult, Visit } from './models';
import { buildReportPdf } from './report-pdf';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';
import { qrDataUrl } from './qr';

/** Structured results: entry, verification and the auto-generated report. */
@Injectable({ providedIn: 'root' })
export class ResultsService {
  private readonly sb = inject(SupabaseService);
  private readonly lab = inject(LabService);
  private readonly tenant = inject(TenantService);
  private readonly auth = inject(AuthService);

  /** Lab admins and staff titled Pathologist verify (also enforced in the database). */
  canVerify(): boolean {
    const p = this.auth.profile();
    return p?.role === 'lab_owner' || (p?.role === 'lab_staff' && p?.title === 'Pathologist');
  }

  /** The lab's definition (parameters) for each test ordered on the visit. */
  testsFor(v: Visit): TestItem[] {
    const catalog = this.tenant.tenant()?.test_catalog ?? [];
    return v.tests.map((t) => ({ ...t, ...(catalog.find((c) => c.code === t.code) ?? {}), price: t.price }));
  }

  async forVisit(visitId: string): Promise<TestResult[]> {
    const { data, error } = await this.sb.client.from('test_results').select('*').eq('visit_id', visitId);
    if (error) throw new Error(error.message);
    return (data ?? []) as TestResult[];
  }

  /** Save one test's values; status 'entered' or 'verified'. */
  async save(v: Visit, testCode: string, values: Record<string, ResultValue>, status: 'entered' | 'verified', notes: string | null): Promise<TestResult> {
    const { data, error } = await this.sb.client
      .from('test_results')
      .upsert({ tenant_id: v.tenant_id, visit_id: v.id, test_code: testCode, values, status, source: 'manual', notes: notes?.trim() || null }, { onConflict: 'visit_id,test_code' })
      .select()
      .single();
    if (error) throw new Error(/only a lab admin or pathologist/i.test(error.message) ? 'Only a lab admin or a pathologist can verify results.' : error.message);
    if (v.status === 'collected') await this.lab.setStatus(v, 'in_lab').catch(() => undefined);
    return data as TestResult;
  }

  /** Build the PDF from verified results, upload it as the visit's report (→ Ready, WhatsApp, AI as usual). */
  async createReport(v: Visit, results: TestResult[]): Promise<Visit> {
    const t = this.tenant.tenant();
    if (!t) throw new Error('Lab not loaded');
    const tests = this.testsFor(v);
    const trackUrl = this.lab.trackUrl(v);
    const blob = await buildReportPdf({
      lab: { name: t.name, address: t.address, contact_phone: t.contact_phone, contact_email: t.contact_email, logo_url: t.logo_url, brand_color: t.brand_color },
      visit: v,
      tests,
      results,
      verifiedBy: { name: this.auth.displayName(), title: this.auth.profile()?.title || (this.auth.isOwner() ? 'Lab admin' : 'Lab staff') },
      trackUrl,
      qr: await qrDataUrl(trackUrl, { margin: 0, width: 240 }),
      brand: `${environment.brand.name} ${environment.brand.product}`,
    });
    const file = new File([blob], `${v.token}_report.pdf`, { type: 'application/pdf' });
    const updated = await this.lab.uploadReport(v, file);
    // Exact values for trends (no AI reading needed)
    const values: ReportValue[] = [];
    for (const test of tests) {
      const r = results.find((x) => x.test_code === test.code);
      for (const p of test.params ?? []) {
        const val = r?.values[p.key];
        if (val?.n == null) continue;
        values.push({ test: p.name, value: val.n, unit: p.unit ?? null, low: p.low ?? null, high: p.high ?? null, flag: val.flag === 'abnormal' ? 'high' : val.flag });
      }
    }
    return values.length ? this.lab.setResultValues(updated, values).catch(() => updated) : updated;
  }
}
