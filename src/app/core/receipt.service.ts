import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { LabService } from './lab.service';
import { Visit } from './models';
import { TenantService } from './tenant.service';
import { ToastService } from './toast.service';
import { receiptHtml, ReceiptSize } from './receipt-template';

export type { ReceiptSize };

/**
 * Patient receipt for the front desk: token, tests, total and a QR code to track the report.
 * Printed from a hidden iframe so the app's own layout never interferes.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private readonly tenant = inject(TenantService);
  private readonly lab = inject(LabService);
  private readonly toast = inject(ToastService);

  async print(v: Visit, size?: ReceiptSize): Promise<void> {
    const paper = size ?? ((this.tenant.pages() as { receipt_size?: ReceiptSize }).receipt_size || '80mm');
    try {
      const { toDataURL } = await import('qrcode');
      const url = this.lab.trackUrl(v);
      const qr = await toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
      const t = this.tenant.tenant();
      this.printHtml(
        receiptHtml({
          v, url, qr, paper,
          lab: t ? { name: t.name, logo_url: t.logo_url, address: t.address, contact_phone: t.contact_phone } : null,
          brandName: `${environment.brand.name} ${environment.brand.product}`,
          brandLogo: location.origin + '/' + environment.brand.logo.replace(/^\//, ''),
        }),
      );
    } catch (e) {
      this.toast.fail(e, 'Could not prepare the receipt.');
    }
  }

  private printHtml(html: string) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    const go = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1500);
    };
    // Wait for the logo + QR to load so they appear on paper
    const imgs = Array.from(doc.images);
    let pending = imgs.filter((i) => !i.complete).length;
    if (!pending) {
      setTimeout(go, 50);
      return;
    }
    const done = () => --pending <= 0 && go();
    imgs.forEach((i) => {
      if (!i.complete) {
        i.onload = done;
        i.onerror = done;
      }
    });
    setTimeout(() => pending > 0 && ((pending = 0), go()), 3000);
  }
}
