# AI-Lab — master pending list

One place for everything not built yet. Updated 2026-10-18. Tick items off here when they ship.
Details: payments → [payments-architecture.md](payments-architecture.md).

## 1. Ready to build (no account or approval needed)
Say **"build payments"** to start with A1–A4.

| # | Item | Notes |
|---|---|---|
| A1 | **Counter payment modes** for patients | cash, cash on collection (home pickup), lab UPI QR, card POS, cheque, bank, part / advance, due — `visit_payments` table |
| A2 | **Bills & payment history** | per visit (tests, discount, total, paid, due) and per patient across all visits; ✅ paid ⏳ pending ❌ failed/rejected ↩ refunded ticks; day-end collection report by mode / staff |
| A3 | ~~Report per test~~ | done via `test_results` (status per test); patient-side display is L5 |
| A4 | **Patient emails** | token + tracking link, report ready, payment receipt, due reminder — lab logo / name / address / phone; only with email + consent (add optional email to the add-patient form) |
| A5 | **More lab emails** | payment received receipt, payment failed / rejected, trial ending soon |
| A6 | **Export all lab data** | patients Excel + all report PDFs zip — for labs that leave (build on first request) |
| A7 | **"Hold report until paid"** lab setting | enforce in `track_visit`, not only in the UI |

## LIS — done 2026-10-19
Result values per test (standard templates, ranges, formulas) · Results screen (entry → verify → automatic PDF) · edit tests after
registration · tube barcode labels · Devices (settings, code mapping, device key, ASTM/HL7 endpoint, test-message simulator, message log).
Details: [lis-devices.md](lis-devices.md).

| # | Next for LIS | Notes |
|---|---|---|
| L1 | **SpreadApps Lab Connector** (Windows) | reads the analyzer's serial / LAN port and POSTs messages to `device-ingest` — needs a real analyzer + its LIS manual to test |
| L2 | Two-way (host query) | analyzer asks AI-Lab which tests to run for a barcode |
| L3 | Delta checks & critical values | warn on big change since last visit; call-the-doctor list |
| L4 | Pathologist signature image + NABL fields on the report | |
| P1 | **Patient accounts (Google sign-in) — built, ON HOLD** | switch on: create the free Google OAuth client (no billing / no $300 trial needed), enable Google in Supabase, set `environment.features.googleSignIn = true` |
| P2 | Booking alerts to the lab by email / WhatsApp | today: live badge + list in Bookings |
| L5 | Per-test report status for patients | "CBP ready, Thyroid pending" on the track page (data exists in `test_results`) |

## 2. Waiting on you (tell me when it's done)
| # | Item | What you do first | Then I build |
|---|---|---|---|
| B1 | **Razorpay — labs pay SpreadApps online** | Razorpay account approved (PAN, business bank account) | order + checkout + webhook → invoice auto-paid |
| B2 | **Razorpay — patients pay the lab online** | each lab creates its own Razorpay account | "Pay ₹X" on the track page with the lab's keys |
| B3 | **Invite / verify emails for new logins** | Supabase → Auth → SMTP = Resend (smtp.resend.com, 465, user `resend`, password = Resend key, sender noreply@mail.spreadapps.in) | Create login sends a verify link instead of a password |
| B4 | **Circles ticket bridge** | restore the Circles Supabase project | tickets sync both ways, "My tickets" for labs |
| B5 | **Automatic WhatsApp sending** | WhatsApp Business API account (Meta / Gupshup / Interakt / WATI) | reports sent without tapping Share |
| B6 | **Business name in legal pages** | send official name + address (e.g. "SpreadApps, proprietor …, Hyderabad") | Privacy, Terms, invoices, sales footer |
| B7 | **AI for a lab** | lab's own AI key (or yours for the demo lab, model `claude-haiku-5-5`) | nothing — paste in Lab → API keys |
| B8 | **Payment details** | Admin → Settings → Invoice payments: UPI ID, payee, bank | nothing — labs see the QR |

## 3. Before the first paying lab (business / setup)
- Supabase **Pro** ($25/month, one for all labs) — free plan pauses and has no backups.
- Lawyer review of Privacy notice & Terms (DPDP Act).
- Trademark search for "SpreadApps" (IP India, classes 9 & 42); Udyam registration; current account; trademark filing later.
- Remove fake demo logins from real use (`owner@srisai.demo` stays only in the demo lab); real emails for every lab admin.

## 4. Later / optional
- Razorpay **Route** (collect for labs, keep a commission).
- Re-record the demo videos (`public/demo/*.mp4`) when the UI changes.
- Google Ads once 2–3 labs use it; testimonial from Vijaya Lab on the sales page.

## Rules that always apply
- Never touch **spreadapps.in** (portfolio). Sales page lives only at **ailab.spreadapps.in**.
- Never touch Supabase `kdafyqbfvlibytunzkns` (someone else's live app).
- Timelines / history everywhere (newest first); honest "coming soon" labels on the sales page.
- Branded dialogs and toasts only (no browser popups); inline field validation; keep Help pages updated with every feature.
