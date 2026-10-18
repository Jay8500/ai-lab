export type Role = 'super_admin' | 'platform_admin' | 'lab_owner' | 'lab_staff';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super admin',
  platform_admin: 'SpreadApps admin',
  lab_owner: 'Lab admin',
  lab_staff: 'Lab staff',
};

/** Job titles for lab staff (display + future per-title permissions). */
export const STAFF_TITLES = ['Receptionist', 'Lab technician', 'Pathologist', 'Sample collector', 'Accountant', 'Manager', 'Other'];
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'expired';
export type VisitStatus = 'collected' | 'in_lab' | 'verified' | 'ready' | 'delivered';
export type BillingModel = 'free' | 'monthly' | 'yearly' | 'per_report' | 'revenue_share' | 'hybrid';

export interface TestItem {
  code: string;
  name: string;
  price: number;
  tat_hours?: number;
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
  show_support?: boolean;
  show_whatsapp?: boolean;
  show_powered_by?: boolean;
  show_security?: boolean;
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
  pages: TenantPages;
  test_catalog: TestItem[];
}

export interface Tenant extends Omit<TenantPublic, 'trial_ends_at' | 'usable'> {
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
  ai_model?: string | null;
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
  status: 'due' | 'paid' | 'waived';
  note: string | null;
  paid_at: string | null;
  due_date?: string | null;
  notified_at?: string | null;
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
