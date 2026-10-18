import { Visit } from './models';

export type ReceiptSize = '80mm' | 'a5' | 'a4';

export interface ReceiptData {
  v: Pick<Visit, 'token' | 'patient_name' | 'age' | 'gender' | 'mobile' | 'tests' | 'amount' | 'created_at'>;
  url: string;
  /** QR code image as a data: URL */
  qr: string;
  paper: ReceiptSize;
  lab: { name: string; logo_url: string | null; address: string | null; contact_phone: string | null } | null;
  brandName: string;
  brandLogo: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');

/** Printable patient receipt (thermal 80 mm, A5 or A4). Pure function — no Angular. */
export function receiptHtml(r: ReceiptData): string {
const { v, url, qr, paper, lab, brandName, brandLogo } = r;
  const narrow = paper === '80mm';
  const logo = lab?.logo_url || brandLogo;
  const when = new Date(v.created_at);
  const mobile = v.mobile ? '•••••' + v.mobile.slice(-4) : '—';
  const rows = v.tests
    .map((x) => `<tr><td>${esc(x.name)}<div class="muted">${esc(x.code)}${x.tat_hours ? ` · ~${esc(x.tat_hours)}h` : ''}</div></td><td class="r">${inr(x.price)}</td></tr>`)
    .join('');
  const brand = esc(brandName);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(v.token)}</title>
<style>
@page { size: ${narrow ? '80mm auto' : paper === 'a5' ? 'A5' : 'A4'}; margin: ${narrow ? '3mm' : '12mm'}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; font-size: ${narrow ? '11px' : '13px'}; }
.wrap { width: ${narrow ? '74mm' : '100%'}; margin: 0 auto; }
.head { display: flex; align-items: center; gap: 10px; ${narrow ? 'flex-direction: column; text-align: center;' : ''} padding-bottom: 8px; border-bottom: 1.5px dashed #94a3b8; }
.head img { width: ${narrow ? '40px' : '52px'}; height: ${narrow ? '40px' : '52px'}; object-fit: contain; }
.lab { font-size: ${narrow ? '14px' : '18px'}; font-weight: 800; }
.muted { color: #64748b; font-size: ${narrow ? '9.5px' : '11px'}; }
.token { text-align: center; margin: 10px 0 6px; }
.token .k { font-size: ${narrow ? '9px' : '11px'}; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
.token .v { font-family: Consolas, 'Courier New', monospace; font-size: ${narrow ? '22px' : '30px'}; font-weight: 800; letter-spacing: .06em; }
table { width: 100%; border-collapse: collapse; }
.meta td { padding: 2px 0; } .meta td:first-child { color: #64748b; width: 38%; }
.tests { margin-top: 8px; border-top: 1.5px dashed #94a3b8; }
.tests td { padding: 5px 0; border-bottom: 1px dotted #cbd5e1; vertical-align: top; }
.r { text-align: right; white-space: nowrap; padding-left: 8px; }
.total td { font-weight: 800; font-size: ${narrow ? '13px' : '15px'}; border-bottom: 0; padding-top: 7px; }
.qr { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1.5px dashed #94a3b8; ${narrow ? 'flex-direction: column; text-align: center;' : ''} }
.qr img { width: ${narrow ? '34mm' : '38mm'}; height: ${narrow ? '34mm' : '38mm'}; }
.qr b { font-size: ${narrow ? '12px' : '14px'}; }
.url { word-break: break-all; font-family: Consolas, 'Courier New', monospace; font-size: ${narrow ? '9px' : '10.5px'}; }
.foot { margin-top: 10px; text-align: center; color: #94a3b8; font-size: ${narrow ? '8.5px' : '10px'}; }
</style></head><body><div class="wrap">
<div class="head">
  <img src="${esc(logo)}" alt="">
  <div>
    <div class="lab">${esc(lab?.name ?? brand)}</div>
    ${lab?.address ? `<div class="muted">${esc(lab.address)}</div>` : ''}
    ${lab?.contact_phone ? `<div class="muted">Ph: ${esc(lab.contact_phone)}</div>` : ''}
  </div>
</div>

<div class="token"><div class="k">Token</div><div class="v">${esc(v.token)}</div></div>

<table class="meta">
  <tr><td>Patient</td><td><b>${esc(v.patient_name)}</b></td></tr>
  <tr><td>Age / Sex</td><td>${esc(v.age ?? '—')} / ${esc(v.gender ?? '—')}</td></tr>
  <tr><td>Mobile</td><td>${esc(mobile)}</td></tr>
  <tr><td>Date</td><td>${esc(when.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td></tr>
</table>

<table class="tests">
  ${rows}
  <tr class="total"><td>Total</td><td class="r">${inr(v.amount)}</td></tr>
</table>

<div class="qr">
  <img src="${qr}" alt="QR">
  <div>
    <b>Track your report live</b>
    <div class="muted" style="margin:3px 0 4px">Scan the QR, or open the link and enter your token. Download the official PDF when it’s ready — no login needed.</div>
    <div class="url">${esc(url)}</div>
  </div>
</div>

<div class="foot">Thank you · Powered by ${brand}</div>
</div></body></html>`;
}
