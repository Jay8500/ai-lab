# Payments — architecture (planned, not built yet)

Status (2026-10-18): only **labs → SpreadApps** invoices exist, paid by UPI QR + UTR and confirmed by hand.
Nothing uses Razorpay yet. Build this once SpreadApps has a Razorpay account.

There are two separate money flows. Keep them separate — different payers, different accounts, different rules.

| | Flow A · SaaS billing | Flow B · Patient bills |
|---|---|---|
| Who pays | Lab → **SpreadApps** | Patient → **the lab** |
| Razorpay account | SpreadApps' own (one) | **Each lab's own** (keys already have fields in Vault) |
| Today | UPI QR + UTR, manual confirm | Nothing in the app (labs collect at the counter) |
| Modes | Online (Razorpay), UPI + UTR, bank, cash, cheque | Cash, lab UPI QR, card (POS), online link, partial / advance, due |

---

## Flow A — labs pay SpreadApps (Razorpay on top of what exists)

```
Lab admin → Plan & team → Pay now
  ├─ "Pay online" (Razorpay)          ← new
  │    1. edge fn  billing-order      : reads billing_events.amount (never from the client)
  │                                     creates Razorpay order (receipt = billing_events.id)
  │    2. Razorpay Checkout (web)      : card / UPI intent / netbanking, inside the PWA
  │    3. edge fn  razorpay-webhook    : payment.captured → verify X-Razorpay-Signature
  │                                     → billing_events.status='paid', paid_via='online',
  │                                       payment_ref = razorpay payment id, paid_at
  │    4. Lab sees "Paid" (realtime); owner gets an email like lead-alert
  └─ "UPI / bank" (existing)           : UTR → verifying → admin confirms
```

DB: reuse `billing_events` (`paid_via` already allows `'online'`). Add `razorpay_order_id`, unique index on
`payment_ref` for idempotency. Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
as Supabase secrets (platform level). Overdue pause logic is unchanged — a captured payment just sets `paid`.

## Flow B — patients pay the lab

### Recommended start: each lab uses its own Razorpay account
Money goes **straight to the lab**. SpreadApps never holds patient money (simpler legally, no payment-aggregator
licence questions). The lab's `razorpay_key_id / key_secret` (+ new `razorpay_webhook_secret`) live in Vault per tenant.

Later option: **Razorpay Route** (marketplace) — SpreadApps collects and auto-splits to each lab as a linked
account, can keep a per-transaction fee. Needs Route approval + KYC for every lab. Only if a commission model is wanted.

### Data model
```
visits (existing) + bill fields
  bill_amount      numeric   -- sum of tests (today's `amount`)
  discount         numeric   default 0
  paid_amount      numeric   default 0   -- kept in sync from visit_payments (trigger)
  payment_status   text      'unpaid' | 'partial' | 'paid' | 'refunded'

visit_payments (new)                       -- one row per money movement
  id, tenant_id, visit_id
  amount           numeric  > 0
  mode             text     'cash' | 'upi' | 'card' | 'online' | 'other'
  reference        text     -- UTR / card slip no. / razorpay payment id
  razorpay_order_id, razorpay_payment_id (unique)
  status           text     'created' | 'captured' | 'failed' | 'refunded'
  received_by      uuid     -- staff (null for online)
  created_at
RLS: lab users of the tenant read/insert (counter modes); online rows only via service role (webhook).
Trigger: recompute visits.paid_amount / payment_status; write activity_log ('payment').
```

### Counter (several modes)
Add-patient modal & patient card: **Collect payment** → amount (full / advance), mode, reference (UPI/card).
Receipt shows Paid / Due. Optional lab setting **"Hold report until paid"**: track page and Download stay
locked while `payment_status <> 'paid'` (enforce in `track_visit`, not only in the UI).

### Online (patient on the lab's site / PWA)
```
Track page (/track/:token) shows "Pay ₹due" when due > 0 and the lab has Razorpay keys
  1. edge fn patient-order  : (slug, token) → due computed server-side → Razorpay order with the LAB's key
                              → insert visit_payments(status='created')
  2. Razorpay Checkout      : prefill patient name/phone, lab name & logo
  3. edge fn razorpay-webhook?tenant=<slug> : verify with the lab's webhook secret
                              → visit_payments captured → trigger updates visit → realtime to lab dashboard
  4. Patient sees "Paid ✓"; WhatsApp message can include the pay link (/track/:token)
```

### Reports for labs
Day-end **collection report**: totals by mode (cash / UPI / card / online), by staff, dues outstanding.
Export to Excel.

---

## Rules (both flows)
- Amounts are always computed on the server; the client never sends the amount to charge.
- Webhooks are the source of truth (not the browser callback); verify signatures; idempotent on payment id.
- Keys only in Vault / Supabase secrets; never sent to the browser except the public `key_id` for Checkout.
- Refunds: start from the Razorpay dashboard; webhook `refund.processed` → status `refunded`.
- Everything writes to `activity_log` so it shows in the timelines.

## Requirements from the owner (2026-10-18) — must be in the build

**Payment modes everywhere (labs paying SpreadApps AND patients paying labs)**
- All Razorpay methods (UPI, cards, netbanking, wallets, EMI/pay-later where enabled) plus offline modes:
  cash, cash on collection / COD (e.g. home sample collection), lab UPI QR, card POS, cheque, bank transfer,
  partial / advance, due.
- Smooth, simple screens: pick a mode → pay or record → clear result.

**Clear status ticks**
- ✅ Paid / approved · ⏳ Pending / verifying · ❌ Failed / rejected (with reason) · ↩ Refunded.
- Same look for lab invoices and patient bills.

**Payment history**
- Labs: full history of what they paid SpreadApps (invoices, mode, reference, status, receipts) — exists for UPI/UTR, extend to online + receipts download.
- Patients (per lab): every payment for every visit, mode, status, receipt; visible to lab staff and on the patient's track page.

**Orders, bills and reports per item**
- A patient can have multiple orders (visits), each with multiple tests.
- Bill summary per visit (tests, discount, total, paid, due) and per patient across all visits (lifetime total / paid / due).
- Report status per test (pending / ready per item), one or more PDFs linked to each test, not only one PDF per visit.
  → new `visit_items` (visit_id, test code/name, price, status, report_path) — keep `visits.tests` for old data.

**Emails (Resend, sender per lab name; lab logo, address, phone in the template)**
- Patients (only if they give an email + consent): token & tracking link at registration, "report ready" with link,
  payment receipt, payment failed / due reminder. Add optional `visits.email` (and on the add-patient form).
- Labs (exists for invoices/notices): add payment-received receipts, payment failed/rejected, trial ending.
- Every email has the lab profile details and the tracking link; WhatsApp share stays as the main channel.

## Build order
1. Flow A online payments (SpreadApps account) — removes manual UTR checking.
2. Flow B counter payments (cash / UPI / card / due) — useful even without Razorpay.
3. Flow B online payments per lab (lab's own Razorpay keys).
4. Optional: Razorpay Route commission model.
