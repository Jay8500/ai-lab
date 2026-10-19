import { inject, Injectable } from '@angular/core';
import { Visit } from './models';
import { printHtml } from './print-html';
import { TenantService } from './tenant.service';
import { ToastService } from './toast.service';

/** One letter per tube type, added to the token on the label: SRS-1018-004-E */
const TUBE: [RegExp, string][] = [
  [/edta|purple/i, 'E'], [/fluoride|grey|gray/i, 'F'], [/serum|red|yellow/i, 'S'], [/citrate|blue/i, 'C'],
  [/urine/i, 'U'], [/stool/i, 'T'], [/swab/i, 'W'],
];
const tubeCode = (sample: string) => TUBE.find(([re]) => re.test(sample))?.[1] ?? 'X';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Tube barcode labels (50 × 25 mm, the common thermal label size): one label per sample type.
 * The barcode is the visit token + tube letter, which analyzers send back with their results.
 */
@Injectable({ providedIn: 'root' })
export class LabelsService {
  private readonly tenant = inject(TenantService);
  private readonly toast = inject(ToastService);

  async print(v: Visit, copies = 1) {
    try {
      const { default: JsBarcode } = await import('jsbarcode');
      const catalog = this.tenant.tenant()?.test_catalog ?? [];
      const groups = new Map<string, string[]>();
      for (const t of v.tests) {
        const sample = catalog.find((c) => c.code === t.code)?.sample || t.sample || 'Sample';
        groups.set(sample, [...(groups.get(sample) ?? []), t.code]);
      }
      const labels: string[] = [];
      for (const [sample, codes] of groups) {
        const value = groups.size > 1 ? `${v.token}-${tubeCode(sample)}` : v.token;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg, value, { format: 'CODE128', displayValue: false, height: 34, margin: 0, width: 1.4 });
        svg.setAttribute('preserveAspectRatio', 'none');
        const label = `<div class="l">
            <div class="top"><b>${esc(v.patient_name.slice(0, 22))}</b><span>${v.age ?? ''}${v.gender ? '/' + v.gender : ''}</span></div>
            <div class="bc">${svg.outerHTML}</div>
            <div class="id">${esc(value)}</div>
            <div class="bot"><span>${esc(sample.split(' (')[0])}</span><span>${esc(codes.join(', ').slice(0, 26))}</span></div>
          </div>`;
        for (let i = 0; i < copies; i++) labels.push(label);
      }
      printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Labels ${esc(v.token)}</title><style>
        @page { size: 50mm 25mm; margin: 0 }
        * { box-sizing: border-box; margin: 0 }
        body { font-family: Arial, sans-serif; color: #000 }
        .l { width: 50mm; height: 25mm; padding: 1.2mm 2mm; page-break-after: always; display: flex; flex-direction: column; overflow: hidden }
        .top, .bot { display: flex; justify-content: space-between; gap: 2mm; font-size: 7pt; white-space: nowrap; overflow: hidden }
        .top b { overflow: hidden; text-overflow: ellipsis }
        .bc { flex: 1; min-height: 0; margin-top: .6mm } .bc svg { width: 100%; height: 100% }
        .id { font: bold 8pt monospace; text-align: center; letter-spacing: .5px }
        .bot { font-size: 6pt; color: #333 }
      </style></head><body>${labels.join('')}</body></html>`);
    } catch (e) {
      this.toast.fail(e, 'Could not prepare the labels.');
    }
  }
}
