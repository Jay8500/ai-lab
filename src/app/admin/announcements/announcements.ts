import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminService } from '../../core/admin.service';
import { SupabaseService } from '../../core/supabase.service';
import { cleanText } from '../../core/text-clean';
import { ToastService } from '../../core/toast.service';
import { FormField } from '../../shared/form-field';
import { Timeline, TimelineItem } from '../../shared/timeline';
import { DialogService } from '../../core/dialog.service';

type Category = 'general' | 'payment' | 'feature' | 'maintenance' | 'trial';
type Field = 'subject' | 'body' | 'audience';

interface Announcement {
  id: string;
  category: Category;
  subject: string;
  recipients: number;
  in_app_count: number;
  sent: number;
  failed: number;
  skipped_no_email: number;
  status: 'sending' | 'sent' | 'partial' | 'failed';
  error: string | null;
  created_at: string;
}

const CATEGORIES: { v: Category; l: string; tone: string }[] = [
  { v: 'general', l: 'Update', tone: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { v: 'payment', l: 'Payment', tone: 'bg-amber-50 text-amber-600 border-amber-100' },
  { v: 'feature', l: 'New feature', tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { v: 'maintenance', l: 'Maintenance', tone: 'bg-rose-50 text-rose-600 border-rose-100' },
  { v: 'trial', l: 'Trial', tone: 'bg-violet-50 text-violet-600 border-violet-100' },
];

const TEMPLATES: { l: string; category: Category; statuses: string[]; subject: string; body: string }[] = [
  {
    l: 'Payment reminder',
    category: 'payment',
    statuses: ['active'],
    subject: 'Payment reminder for {{lab}}',
    body: 'Hi {{name}},\n\nThis is a friendly reminder that the subscription for **{{lab}}** ({{plan}}) is due.\n\nPlease complete the payment to keep reports flowing without interruption. Reply to this email if you need the invoice again.\n\nThank you for choosing SpreadApps!',
  },
  {
    l: 'Trial ending',
    category: 'trial',
    statuses: ['trial'],
    subject: 'Your free trial ends on {{trial_end}}',
    body: 'Hi {{name}},\n\nYour AI-Lab free trial for **{{lab}}** ends on **{{trial_end}}**.\n\nTo keep generating tokens and sharing reports, choose a plan — just reply to this email and we will set it up for you.\n\nYour lab: {{lab_url}}',
  },
  {
    l: 'New feature',
    category: 'feature',
    statuses: [],
    subject: 'New in AI-Lab: …',
    body: 'Hi {{name}},\n\nWe just added something new to AI-Lab for {{lab}}:\n\n**What’s new** — describe the feature here.\n\nIt’s already live — sign in at {{lab_url}} to try it.',
  },
  {
    l: 'Maintenance',
    category: 'maintenance',
    statuses: [],
    subject: 'Scheduled maintenance on …',
    body: 'Hi {{name}},\n\nAI-Lab will be briefly unavailable on **[date] from [time] to [time] IST** for an upgrade.\n\nPatient report links keep working. Please plan registrations around this window.\n\nSorry for the inconvenience!',
  },
];

const TOKENS = ['{{name}}', '{{lab}}', '{{plan}}', '{{trial_end}}', '{{lab_url}}'];
const STATUSES = ['active', 'trial', 'expired', 'suspended'];

@Component({
  selector: 'app-admin-announcements',
  imports: [FormsModule, RouterLink, LucideAngularModule, FormField, Timeline],
  templateUrl: './announcements.html',
})
export class AdminAnnouncements implements OnInit {
  protected readonly admin = inject(AdminService);
  private readonly sb = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);

  protected readonly categories = CATEGORIES;
  protected readonly templates = TEMPLATES;
  protected readonly tokens = TOKENS;
  protected readonly statusOptions = STATUSES;
  protected readonly subjectHint = 'Short and specific, e.g. “Payment due for {{lab}}”.';
  protected readonly bodyPlaceholder = 'Hi {{name}}, …';

  sampleText(): string {
    const info = this.audienceInfo();
    if (!info) return '';
    const names = info.sample.slice(0, 3).map((s) => `${s.name} (${s.lab})`).join(', ');
    return info.count > 3 ? names + '…' : names;
  }

  protected readonly configured = signal<boolean | null>(null);
  protected readonly fromLabel = signal('');
  protected readonly history = signal<Announcement[]>([]);
  /** Sent announcements as a timeline, newest first. */
  protected readonly sentItems = computed<TimelineItem[]>(() =>
    this.history().map((a) => {
      const look: Record<Category, { icon: string; tone: string }> = {
        general: { icon: 'megaphone', tone: 'bg-indigo-100 text-indigo-600' },
        payment: { icon: 'credit-card', tone: 'bg-amber-100 text-amber-700' },
        feature: { icon: 'sparkles', tone: 'bg-emerald-100 text-emerald-600' },
        maintenance: { icon: 'triangle-alert', tone: 'bg-rose-100 text-rose-600' },
        trial: { icon: 'hourglass', tone: 'bg-violet-100 text-violet-600' },
      };
      const parts = [
        a.recipients ? `✉ ${a.sent}/${a.recipients} emailed` : '',
        a.in_app_count ? `🔔 ${a.in_app_count} in-app` : '',
        a.failed ? `${a.failed} failed` : '',
        a.skipped_no_email ? `${a.skipped_no_email} without email` : '',
      ].filter(Boolean);
      return { id: a.id, at: a.created_at, title: a.subject, subtitle: parts.join(' · '), icon: look[a.category].icon, tone: look[a.category].tone, chips: [this.catLabel(a.category).l] };
    }),
  );

  protected readonly category = signal<Category>('general');
  protected readonly subject = signal('');
  protected readonly body = signal('');
  protected readonly toAdmins = signal(true);
  protected readonly toStaff = signal(false);
  protected readonly statuses = signal<string[]>([]);
  protected readonly labIds = signal<string[]>([]);
  protected readonly audienceInfo = signal<{ count: number; inApp: number; skipped: number; sample: { name: string; lab: string }[] } | null>(null);
  protected readonly viaEmail = signal(true);
  protected readonly viaApp = signal(true);
  protected readonly channels = computed(() => [...(this.viaEmail() ? ['email'] : []), ...(this.viaApp() ? ['in_app'] : [])]);
  /** People reached by the chosen channels */
  protected readonly reach = computed(() => {
    const i = this.audienceInfo();
    if (!i) return 0;
    return this.viaApp() ? i.inApp : i.count;
  });
  protected readonly counting = signal(false);

  protected readonly touched = signal<Partial<Record<Field, boolean>>>({});
  protected readonly submitted = signal(false);
  protected readonly sending = signal<'test' | 'send' | null>(null);
  private countTimer?: ReturnType<typeof setTimeout>;

  protected readonly audience = computed(() => ({
    roles: [...(this.toAdmins() ? ['lab_owner'] : []), ...(this.toStaff() ? ['lab_staff'] : [])],
    statuses: this.statuses(),
    tenant_ids: this.labIds(),
  }));

  protected readonly errors = computed<Partial<Record<Field, string>>>(() => {
    const e: Partial<Record<Field, string>> = {};
    const s = this.subject().trim();
    if (!s) e.subject = 'Subject is required — it’s the first thing labs see in their inbox.';
    else if (s.length < 3) e.subject = 'Make the subject at least 3 characters.';
    else if (s.length > 150) e.subject = `Too long by ${s.length - 150} characters — keep subjects short so they aren’t cut off.`;
    const b = this.body().trim();
    if (!b) e.body = 'Write the message — greet them, explain the update, and say what to do next.';
    else if (b.length < 10) e.body = 'The message is too short to be useful (at least 10 characters).';
    else if (b.length > 10000) e.body = 'The message is over 10,000 characters — shorten it or link to a page.';
    if (!this.toAdmins() && !this.toStaff()) e.audience = 'Choose who should receive it — lab admins, staff, or both.';
    else if (!this.channels().length) e.audience = 'Choose how to deliver it — Email, In-app, or both.';
    else if (this.audienceInfo() && this.reach() === 0) e.audience = this.viaApp() ? 'Nobody matches these filters.' : 'Nobody with an email address matches these filters — tick In-app to reach them in the app.';
    return e;
  });
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);

  /** Email preview with the tokens filled from a sample lab. */
  protected readonly previewHtml = computed(() => this.render(this.body() || 'Your message will appear here…'));
  protected readonly previewSubject = computed(() => this.fill(this.subject() || 'Subject'));

  async ngOnInit() {
    await this.admin.ensureLoaded();
    this.call({ action: 'status' })
      .then((r) => {
        this.configured.set(!!r.configured);
        this.fromLabel.set(r.from ?? '');
      })
      .catch(() => this.configured.set(false));
    this.loadHistory();
    this.recount();
  }

  show(f: Field): string | null {
    return this.submitted() || this.touched()[f] ? (this.errors()[f] ?? null) : null;
  }

  touch(f: Field) {
    this.touched.update((t) => ({ ...t, [f]: true }));
  }

  async useTemplate(t: (typeof TEMPLATES)[number]) {
    if (
      (this.subject() || this.body()) &&
      !(await this.dialog.confirm({
        title: `Use the “${t.l}” template?`,
        message: 'Your current subject and message will be replaced.',
        confirmText: 'Replace',
        tone: 'warning',
        icon: 'file-text',
      }))
    )
      return;
    this.category.set(t.category);
    this.subject.set(t.subject);
    this.body.set(t.body);
    this.statuses.set(t.statuses);
    this.recount();
  }

  insertToken(tok: string) {
    this.body.update((b) => (b && !b.endsWith(' ') && !b.endsWith('\n') ? b + ' ' : b) + tok);
  }

  toggleStatus(s: string) {
    this.statuses.update((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
    this.recount();
  }

  toggleLab(id: string) {
    this.labIds.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    this.recount();
  }

  recount() {
    clearTimeout(this.countTimer);
    this.counting.set(true);
    this.countTimer = setTimeout(async () => {
      try {
        this.audienceInfo.set(await this.call({ action: 'recipients', audience: this.audience() }));
      } catch {
        this.audienceInfo.set(null);
      } finally {
        this.counting.set(false);
      }
    }, 300);
  }

  async sendTest() {
    this.submitted.set(true);
    const { audience, ...rest } = this.errors();
    if (Object.keys(rest).length) return this.toast.warn('Fix the subject and message first.');
    this.sending.set('test');
    try {
      const r = await this.call({ action: 'test', ...this.payload() });
      this.toast.success(`Test sent to ${r.to}.`);
    } catch (e) {
      this.toast.fail(e, 'Could not send the test email.');
    } finally {
      this.sending.set(null);
    }
  }

  async send() {
    this.submitted.set(true);
    if (this.errorCount()) return this.toast.warn(this.errorCount() === 1 ? 'One field needs attention.' : `${this.errorCount()} fields need attention.`);
    const n = this.reach();
    const go = await this.dialog.confirm({
      title: `Send to ${n} recipient${n === 1 ? '' : 's'}?`,
      message: `“${this.subject().trim()}” will be emailed now from ${this.fromLabel() || 'SpreadApps'}. Sent emails can’t be recalled.`,
      details: [
        `Type: ${this.catLabel(this.category()).l}`,
        `Delivery: ${[this.viaEmail() ? `email (${this.audienceInfo()?.count ?? 0})` : '', this.viaApp() ? `in-app (${this.audienceInfo()?.inApp ?? 0})` : ''].filter(Boolean).join(' + ')}`,
        this.sampleText() ? `Goes to e.g. ${this.sampleText()}` : '',
      ].filter(Boolean),
      confirmText: 'Send now',
      tone: 'primary',
      icon: 'send',
    });
    if (!go) return;
    this.sending.set('send');
    try {
      const r = await this.call({ action: 'send', ...this.payload(), audience: this.audience(), channels: this.channels() });
      if (r.status === 'sent') this.toast.success([r.sent ? `Emailed ${r.sent}` : '', r.inApp ? `in-app to ${r.inApp}` : ''].filter(Boolean).join(' · ') + '.');
      else this.toast.error(`Sent ${r.sent}, failed ${r.failed}. ${r.error ?? ''}`.trim());
      this.subject.set('');
      this.body.set('');
      this.submitted.set(false);
      this.touched.set({});
      this.loadHistory();
    } catch (e) {
      this.toast.fail(e, 'Could not send the announcement.');
    } finally {
      this.sending.set(null);
    }
  }

  catLabel(c: Category) {
    return CATEGORIES.find((x) => x.v === c) ?? CATEGORIES[0];
  }

  private payload() {
    return { category: this.category(), subject: cleanText(this.subject()), body: cleanText(this.body()) };
  }

  private async loadHistory() {
    const { data } = await this.sb.client.from('announcements').select('*').order('created_at', { ascending: false }).limit(30);
    this.history.set((data ?? []) as Announcement[]);
  }

  private fill(text: string) {
    return text
      .replaceAll('{{name}}', 'Ravi')
      .replaceAll('{{lab}}', 'Sri Sai Diagnostics')
      .replaceAll('{{plan}}', 'Growth')
      .replaceAll('{{trial_end}}', new Date(Date.now() + 5 * 86_400_000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))
      .replaceAll('{{lab_url}}', 'https://srisai-diagnostics.spreadapps.in');
  }

  private render(text: string) {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    return this.fill(text)
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  private async call(body: Record<string, unknown>) {
    const { data, error } = await this.sb.client.functions.invoke('announce', { body });
    if (error) {
      let msg = error.message;
      try {
        msg = (await (error as { context?: Response }).context?.json())?.error ?? msg;
      } catch {
        /* keep */
      }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
}
