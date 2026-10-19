import { TestItem, TestResult, Visit } from './models';
import { rangeLabel } from './results';

export interface ReportPdfInput {
  lab: { name: string; address: string | null; contact_phone: string | null; contact_email: string | null; logo_url: string | null; brand_color: string };
  visit: Visit;
  /** Ordered tests with their parameter definitions (from the lab's catalogue) */
  tests: TestItem[];
  results: TestResult[];
  verifiedBy: { name: string; title: string };
  trackUrl: string;
  qr: string;
  brand: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [79, 70, 229];
};

/** Logo as a data URL (null when it can't be fetched — the report still prints without it). */
async function imageData(url: string | null): Promise<{ data: string; fmt: 'PNG' | 'JPEG' } | null> {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    if (!/png|jpe?g/.test(blob.type)) return null;
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    return { data, fmt: blob.type.includes('png') ? 'PNG' : 'JPEG' };
  } catch {
    return null;
  }
}

/** Lab report PDF from verified results: letterhead, patient block, one table per test, signature. */
export async function buildReportPdf(i: ReportPdfInput): Promise<Blob> {
  // Both libraries are CommonJS-ish; depending on the bundler the export sits on .default or by name
  const [pdfMod, atMod] = (await Promise.all([import('jspdf'), import('jspdf-autotable')])) as unknown as [Record<string, any>, Record<string, any>]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const jsPDF = pdfMod['jsPDF'] ?? pdfMod['default']?.jsPDF ?? pdfMod['default'];
  const autoTable: (doc: unknown, opts: Record<string, unknown>) => void =
    [atMod['autoTable'], atMod['default'], atMod['default']?.default, atMod['default']?.autoTable].find((f) => typeof f === 'function');
  if (typeof jsPDF !== 'function' || !autoTable) throw new Error('PDF library failed to load');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const brand = hexToRgb(i.lab.brand_color);
  const logo = await imageData(i.lab.logo_url);
  const v = i.visit;

  // ── Letterhead ──
  let x = 14;
  if (logo) {
    try {
      doc.addImage(logo.data, logo.fmt, 14, 10, 16, 16);
      x = 34;
    } catch { /* unsupported image — skip */ }
  }
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...brand).text(i.lab.name, x, 17);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(100);
  const contact = [i.lab.address, i.lab.contact_phone, i.lab.contact_email].filter(Boolean).join('  ·  ');
  if (contact) doc.text(doc.splitTextToSize(contact, W - x - 48), x, 22);
  doc.addImage(i.qr, 'PNG', W - 34, 8, 20, 20);
  doc.setFontSize(6.5).text('Scan to view online', W - 24, 30.5, { align: 'center' });
  doc.setDrawColor(...brand).setLineWidth(0.8).line(14, 33, W - 14, 33);

  // ── Patient block ──
  doc.setFontSize(9).setTextColor(30);
  const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const reportedAt = i.results.map((r) => r.verified_at).filter(Boolean).sort().pop() ?? new Date().toISOString();
  const rows: [string, string, string, string][] = [
    ['Patient', v.patient_name, 'Token', v.token],
    ['Age / Sex', `${v.age ?? '—'} / ${v.gender ?? '—'}`, 'Registered', dt(v.created_at)],
    ['Mobile', v.mobile ? '••••••' + v.mobile.slice(-4) : '—', 'Reported', dt(reportedAt)],
  ];
  autoTable(doc, {
    startY: 37,
    body: rows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2, textColor: 30 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 24, textColor: 90 }, 1: { cellWidth: 70 }, 2: { fontStyle: 'bold', cellWidth: 24, textColor: 90 } },
    margin: { left: 14, right: 14 },
  });

  // ── One table per test ──
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  for (const t of i.tests) {
    const res = i.results.find((r) => r.test_code === t.code);
    const params = t.params ?? [];
    const body: (string | { content: string; colSpan?: number; styles?: object })[][] = [];
    let section = '';
    if (!params.length || !res) {
      body.push([{ content: 'Report attached separately / results to follow.', colSpan: 4, styles: { fontStyle: 'italic', textColor: 120 } }]);
    } else {
      for (const p of params) {
        const val = res.values[p.key];
        if (!val?.v) continue;
        if (p.section && p.section !== section) {
          section = p.section;
          body.push([{ content: section, colSpan: 4, styles: { fontStyle: 'bold', textColor: 90, fillColor: [248, 250, 252] } }]);
        }
        const flag = val.flag === 'high' ? ' H' : val.flag === 'low' ? ' L' : val.flag === 'abnormal' ? ' *' : '';
        body.push([
          (p.section ? '   ' : '') + p.name,
          { content: val.v + flag, styles: flag ? { fontStyle: 'bold', textColor: val.flag === 'low' ? [180, 83, 9] : [190, 18, 60] } : {} },
          p.unit ?? '',
          rangeLabel(p, v.gender, true),
        ]);
      }
      if (res.notes) body.push([{ content: 'Note: ' + res.notes, colSpan: 4, styles: { fontStyle: 'italic', textColor: 90 } }]);
    }
    autoTable(doc, {
      startY: y,
      head: [[{ content: `${t.name} (${t.code})${t.sample ? '  ·  ' + t.sample : ''}`, colSpan: 4 }], ['Test', 'Result', 'Unit', 'Reference range']],
      body,
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold', lineColor: [226, 232, 240] },
      styles: { fontSize: 9, cellPadding: 1.8, lineColor: [226, 232, 240], textColor: 30 },
      columnStyles: { 0: { cellWidth: 72 }, 1: { cellWidth: 34 }, 2: { cellWidth: 30 } },
      didParseCell: (d: { section: string; row: { index: number }; cell: { styles: object } }) => {
        if (d.section === 'head' && d.row.index === 0) Object.assign(d.cell.styles, { fillColor: brand, textColor: 255 });
      },
      margin: { left: 14, right: 14, bottom: 30 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // ── Verification & footer on every page ──
  if (y > doc.internal.pageSize.getHeight() - 45) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(8).setTextColor(110).text('H = above range · L = below range. Results should be interpreted by a qualified doctor along with clinical findings.', 14, y + 2);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(30).text(i.verifiedBy.name, W - 14, y + 16, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90).text(`${i.verifiedBy.title} · Verified electronically`, W - 14, y + 21, { align: 'right' });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240).setLineWidth(0.3).line(14, H - 14, W - 14, H - 14);
    doc.setFontSize(7.5).setTextColor(140);
    doc.text(`${v.token} · ${i.trackUrl}`, 14, H - 9);
    doc.text(`Page ${p} of ${pages} · ${i.brand}`, W - 14, H - 9, { align: 'right' });
  }
  return doc.output('blob');
}
