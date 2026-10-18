import { inject, Injectable } from '@angular/core';
import { AdminService } from './admin.service';
import { BillingEvent, billingLabel } from './models';
import { DialogService } from './dialog.service';
import { ToastService } from './toast.service';

/** Platform admin confirms (or turns back) a payment a lab submitted. Used by Billing and the lab editor. */
@Injectable({ providedIn: 'root' })
export class PaymentReviewService {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  /** Returns true when the invoice changed. */
  async verify(b: BillingEvent, labName: string): Promise<boolean> {
    const ok = await this.dialog.confirm({
      title: 'Confirm this payment?',
      message: `Check that ₹${Number(b.amount).toLocaleString('en-IN')} reached your account before confirming.`,
      details: [`Lab: ${labName}`, `${billingLabel(b.kind)}${b.period ? ' · ' + b.period : ''}`, `Paid by: ${(b.paid_via ?? '').toUpperCase()}`, `Reference: ${b.payment_ref ?? '—'}`, ...(b.payment_note ? [`Note: ${b.payment_note}`] : [])],
      confirmText: 'Mark paid',
      tone: 'success',
      icon: 'badge-check',
    });
    if (!ok) return false;
    try {
      await this.admin.reviewPayment(b, true);
      this.toast.success(`Payment confirmed — ${labName} has been notified.`);
      return true;
    } catch (e) {
      this.toast.fail(e, 'Could not confirm the payment.');
      return false;
    }
  }

  async reject(b: BillingEvent, labName: string): Promise<boolean> {
    const reason = await this.dialog.prompt({
      title: 'Payment not received?',
      message: `The invoice goes back to “due” and ${labName} is asked to check the reference.`,
      label: 'Reason shown to the lab',
      value: 'We couldn’t find this reference in our account. Please check the UTR and submit again.',
      confirmText: 'Send back',
      tone: 'warning',
      validate: (v) => (v.trim().length < 5 ? 'Tell the lab what to check.' : null),
    });
    if (reason === null) return false;
    try {
      await this.admin.reviewPayment(b, false, reason.trim());
      this.toast.info(`${labName} has been asked to check the payment.`);
      return true;
    } catch (e) {
      this.toast.fail(e, 'Could not update the invoice.');
      return false;
    }
  }
}
