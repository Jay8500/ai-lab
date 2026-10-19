export type Role = 'super_admin' | 'platform_admin' | 'lab_owner' | 'lab_staff' | 'patient';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super admin',
  platform_admin: 'SpreadApps admin',
  lab_owner: 'Lab admin',
  lab_staff: 'Lab staff',
  patient: 'Patient',
};

/** Job titles for lab staff (display + future per-title permissions). */
export const STAFF_TITLES = ['Receptionist', 'Lab technician', 'Pathologist', 'Sample collector', 'Accountant', 'Manager', 'Other'];
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'expired';
export type VisitStatus = 'collected' | 'in_lab' | 'verified' | 'ready' | 'delivered';
export type BillingModel = 'free' | 'monthly' | 'yearly' | 'per_report' | 'revenue_share' | 'hybrid';

/** One value reported for a test, e.g. CBP → Haemoglobin. */
export interface TestParam {
  /** Short code, also used to match analyzer results, e.g. HB */
  key: string;
  name: string;
  unit?: string;
  type?: 'number' | 'text' | 'option';
  /** For type 'option' */
  options?: string[];
  /** Reference range (adults); _f = female override */
  low?: number | null;
  high?: number | null;
  low_f?: number | null;
  high_f?: number | null;
  decimals?: number;
  /** Calculated from other keys, e.g. 'CHOL - HDL - TG / 5' */
  formula?: string;
  /** Sub-heading on the report, e.g. 'Differential count' */
  section?: string;
}

export const SAMPLE_TYPES = ['EDTA (purple)', 'Fluoride (grey)', 'Serum (red/yellow)', 'Citrate (blue)', 'Urine', 'Stool', 'Swab', 'Other'];

export interface TestItem {
  code: string;
  name: string;
  price: number;
  tat_hours?: number;
  /** Values to enter for this test (empty = report uploaded as PDF only) */
  params?: TestParam[];
  /** Tube / container — used for barcode labels */
  sample?: string;
  department?: string;
}

/** What is stored on a visit: the ordered test without its parameter definitions. */
export const orderedTest = (t: TestItem): TestItem => ({ code: t.code, name: t.name, price: t.price, ...(t.tat_hours ? { tat_hours: t.tat_hours } : {}), ...(t.sample ? { sample: t.sample } : {}) });

export type ResultFlag = 'low' | 'normal' | 'high' | 'abnormal' | null;
export interface ResultValue {
  v: string;
  n: number | null;
  flag: ResultFlag;
}
export interface TestResult {
  id: string;
  tenant_id: string;
  visit_id: string;
  test_code: string;
  values: Record<string, ResultValue>;
  status: 'pending' | 'entered' | 'verified';
  source: 'manual' | 'device';
  device_id: string | null;
  notes: string | null;
  entered_by: string | null;
  entered_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  updated_at: string;
}

export interface LabDevice {
  id: string;
  tenant_id: string;
  name: string;
  kind: 'hematology' | 'biochemistry' | 'immunoassay' | 'electrolyte' | 'urine' | 'coagulation' | 'hba1c' | 'other';
  make: string | null;
  model: string | null;
  protocol: 'astm' | 'hl7';
  connection: 'serial' | 'tcp' | 'file';
  settings: { host?: string; port?: number | null; baud?: number | null; data_bits?: number; parity?: string; stop_bits?: number; folder?: string };
  mapping: { device_code: string; test_code: string; param_key: string }[];
  active: boolean;
  key_hint: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface DeviceMessage {
  id: string;
  device_id: string;
  received_at: string;
  raw: string | null;
  summary: { results: number; matched: string[]; unmatched: string[]; skipped: string[] } | null;
  status: 'matched' | 'partial' | 'unmatched' | 'error';
  error: string | null;
  simulated: boolean;
}

/** Copy + feature toggles the super admin controls for each lab's pages. */
export interface TenantPages {
  hero_title?: string;
  hero_subtitle?: string;
  login_title?: string;
  login_subtitle?: string;
  footer_note?: string;
  show_track?: boolean;
  show_ai?: boolean;
  /** "How it works" video on the cover page (default on) */
  show_video?: boolean;
  /** Lab's own video instead of the standard one: an .mp4/.webm link or a YouTube link */
  video_url?: string;
  show_support?: boolean;
  show_whatsapp?: boolean;
  show_powered_by?: boolean;
  show_security?: boolean;
  /** Patients can request bookings from the website (default on) */
  show_booking?: boolean;
  /** Offer home sample collection in online bookings (default off) */
  home_collection?: boolean;
  /** Receipt paper: thermal 80 mm (default), A5 or A4 */
  receipt_size?: '80mm' | 'a5' | 'a4';
  ai_disclaimer?: string;
}

/** Public branding returned by resolve_tenant() — safe for anonymous visitors. */
export interface TenantPublic {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  cover_url: string | null;
  brand_color: string;
  accent_color: string;
  contact_phone: string | null;
  contact_email: string | null;
  whatsapp_number: string | null;
  address: string | null;
  status: TenantStatus;
  trial_ends_at: string;
  usable: boolean;
  /** Why new work is paused: inactive | trial_ended | payment_overdue (null when usable) */
  block_reason?: 'inactive' | 'trial_ended' | 'payment_overdue' | null;
  /** The lab has an AI key (AI features only show when this is true) */
  ai_ready?: boolean;
  /** Printed on receipts, e.g. SRS */
  token_prefix?: string;
  pages: TenantPages;
  test_catalog: TestItem[];
}

export interface Tenant extends Omit<TenantPublic, 'trial_ends_at' | 'usable' | 'block_reason' | 'ai_ready'> {
  custom_domain: string | null;
  token_prefix: string;
  plan_id: string | null;
  custom_price: number | null;
  trial_days: number;
  trial_started_at: string;
  subscription_ends_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantSecrets {
  tenant_id: string;
  whatsapp_provider: string | null;
  whatsapp_api_key: string | null;
  whatsapp_phone_id: string | null;
  sms_provider: string | null;
  sms_api_key: string | null;
  sms_sender_id: string | null;
  razorpay_key_id: string | null;
  razorpay_key_secret: string | null;
  ai_provider: string | null;
  ai_api_key: string | null;
  ai_model?: string | null;
  circles_project_id: string | null;
  circles_api_key: string | null;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  billing_model: BillingModel;
  price: number;
  per_report_fee: number;
  revenue_share_pct: number;
  report_quota: number | null;
  setup_fee: number;
  features: Record<string, boolean>;
  is_active: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  tenant_id: string | null;
  title?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

export interface Visit {
  id: string;
  tenant_id: string;
  token: string;
  patient_name: string;
  mobile: string | null;
  age: number | null;
  gender: 'M' | 'F' | 'O' | null;
  tests: TestItem[];
  amount: number;
  status: VisitStatus;
  report_path: string | null;
  report_name: string | null;
  report_uploaded_at: string | null;
  notified_at: string | null;
  delivered_at: string | null;
  ai_summary: string | null;
  ai_status?: 'none' | 'pending' | 'done' | 'error';
  ai_error?: string | null;
  ai_generated_at?: string | null;
  /** Numeric results the AI read from the report (for trends) */
  ai_values?: ReportValue[] | null;
  ai_model?: string | null;
  /** Secret for the patient's link / receipt QR (patients without it must confirm their mobile) */
  access_key?: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  tenant_id: string | null;
  reporter_email: string | null;
  summary: string;
  details: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  screenshot_path: string | null;
  page_url: string | null;
  status: 'open' | 'synced' | 'in_progress' | 'resolved' | 'closed';
  circles_ref: string | null;
  kind?: 'ticket' | 'feedback' | 'lead';
  rating?: number | null;
  created_at: string;
}

/** One numeric result read from a report PDF by the AI. */
export interface ReportValue {
  test: string;
  value: number;
  unit: string | null;
  low: number | null;
  high: number | null;
  flag: 'low' | 'normal' | 'high' | null;
}

export type BillingKind = 'subscription' | 'per_report' | 'revenue_share' | 'setup' | 'database' | 'maintenance' | 'adjustment' | 'other';

/** What each charge is called on invoices and notices. */
export const BILLING_KINDS: { v: BillingKind; l: string }[] = [
  { v: 'subscription', l: 'Software subscription' },
  { v: 'database', l: 'Database & hosting' },
  { v: 'maintenance', l: 'Maintenance & support' },
  { v: 'setup', l: 'Setup fee' },
  { v: 'per_report', l: 'Per-report usage' },
  { v: 'revenue_share', l: 'Revenue share' },
  { v: 'adjustment', l: 'Adjustment' },
  { v: 'other', l: 'Other charge' },
];
export const billingLabel = (k: string) => BILLING_KINDS.find((x) => x.v === k)?.l ?? k.replace('_', ' ');

export interface BillingEvent {
  id: string;
  tenant_id: string;
  kind: BillingKind;
  amount: number;
  period: string | null;
  /** verifying = the lab submitted a payment reference, waiting for SpreadApps to confirm */
  status: 'due' | 'verifying' | 'paid' | 'waived';
  note: string | null;
  paid_at: string | null;
  due_date?: string | null;
  notified_at?: string | null;
  payment_ref?: string | null;
  paid_via?: 'upi' | 'bank' | 'cash' | 'cheque' | 'online' | null;
  payment_submitted_at?: string | null;
  payment_note?: string | null;
  reject_reason?: string | null;
  created_at: string;
}

/** Accounts created without an email get an internal address on this domain (never shown). */
export const NO_EMAIL_DOMAIN = 'no-email.spreadapps.in';

/** The email to show for an account, or '' for username-only accounts. */
export function realEmail(email: string | null | undefined): string {
  return email && !email.endsWith('@' + NO_EMAIL_DOMAIN) ? email : '';
}

/** Two-letter initials from a name, ignoring brackets, digits and symbols ("Jay (SpreadApps)" → "JS"). */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const two = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return two.toUpperCase();
}

export const VISIT_STEPS: { key: VisitStatus; label: string }[] = [
  { key: 'collected', label: 'Collected' },
  { key: 'in_lab', label: 'In Lab' },
  { key: 'verified', label: 'Verified' },
  { key: 'ready', label: 'Ready' },
];

export const DEFAULT_TESTS: TestItem[] = [
  { code: 'CBP', name: 'Complete Blood Picture', price: 350, tat_hours: 6 },
  { code: 'FBS', name: 'Fasting Blood Sugar', price: 120, tat_hours: 3 },
  { code: 'TSH', name: 'Thyroid Profile (T3,T4,TSH)', price: 600, tat_hours: 12 },
  { code: 'LIPID', name: 'Lipid Profile', price: 650, tat_hours: 12 },
];
