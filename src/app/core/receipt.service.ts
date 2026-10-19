import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { LabService } from './lab.service';
import { Visit } from './models';
import { TenantService } from './tenant.service';
import { ToastService } from './toast.service';
import { receiptHtml, ReceiptSize } from './receipt-template';
import { printHtml } from './print-html';
import { qrDataUrl } from './qr';

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
      const url = this.lab.trackUrl(v);
      const qr = await qrDataUrl(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
      const t = this.tenant.tenant();
      printHtml(
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

}
