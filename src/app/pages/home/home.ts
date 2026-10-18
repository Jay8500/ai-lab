import { Component, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { TenantService } from '../../core/tenant.service';
import { ToastService } from '../../core/toast.service';
import { BrandMark } from '../../shared/brand-mark';
import { SalesPage } from '../sales/sales';

/** Cover page: a lab's branded landing on a lab host; the AI-Lab sales page on the platform host. */
@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink, LucideAngularModule, BrandMark, SalesPage],
  templateUrl: './home.html',
})
export class HomePage {
  protected readonly tenant = inject(TenantService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly brand = environment.brand;
  protected readonly year = new Date().getFullYear();

  protected token = '';

  protected readonly howSteps = [
    { title: 'Get your token at the counter', text: 'Your receipt has a token and a QR code for your visit.' },
    { title: 'Track your sample live', text: 'Scan the QR or type the token here to see where your sample is.' },
    { title: 'Download your official report', text: 'The PDF is ready the moment the lab verifies it — earlier reports too.' },
  ];
  /** The lab's own video link, if set (mp4/webm or YouTube) */
  private readonly ownVideo = computed(() => (this.tenant.pages().video_url ?? '').trim());
  protected readonly youtubeEmbed = computed(() => {
    const m = this.ownVideo().match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
    return m ? this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`) : null;
  });
  protected readonly videoSrc = computed(() => this.ownVideo() || '/demo/how-it-works.mp4');
  protected readonly videoPoster = computed(() => (this.ownVideo() ? '' : '/demo/how-it-works.jpg'));
  /** A realistic example token for this lab, e.g. VIJ-1018-001 */
  protected readonly tokenExample = computed(() => {
    const d = new Date();
    const mmdd = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return `${(this.tenant.tenant()?.token_prefix || 'LAB').toUpperCase()}-${mmdd}-001`;
  });

  protected readonly t = computed(() => this.tenant.tenant());
  protected readonly pages = this.tenant.pages;
  /** Lab staff signed in on their own lab get a shortcut to the workspace. */
  protected readonly dashboardLink = computed(() =>
    this.t() && this.auth.isLabUser() && this.auth.profile()?.tenant_id === this.t()!.id ? '/lab' : null,
  );
  protected readonly waLink = computed(() => {
    const n = (this.t()?.whatsapp_number || this.t()?.contact_phone || '').replace(/\D/g, '');
    return n ? `https://wa.me/${n.length === 10 ? '91' + n : n}` : null;
  });

  /** Shown on every lab's cover page — what protects patients' data. */
  protected readonly safeguards = [
    { icon: 'lock', tone: 'bg-indigo-50 text-indigo-600', title: 'Encrypted connection', text: 'Everything between your phone and our servers travels over HTTPS — nobody on the network can read it.' },
    { icon: 'shield-check', tone: 'bg-emerald-50 text-emerald-600', title: 'Encrypted storage', text: 'Your reports and details are stored encrypted on secure servers in India.' },
    { icon: 'file-check', tone: 'bg-sky-50 text-sky-600', title: 'Private report links', text: 'Each report has its own unguessable link. You only need your token — no account, no password to remember.' },
    { icon: 'users', tone: 'bg-violet-50 text-violet-600', title: 'Strict access control', text: 'Only our own authorised staff can see your visit. Other labs on the platform can never access it.' },
    { icon: 'monitor', tone: 'bg-amber-50 text-amber-600', title: 'One active login', text: 'Staff accounts work on one device at a time. Signing in elsewhere signs the old device out instantly.' },
    { icon: 'key-round', tone: 'bg-rose-50 text-rose-600', title: 'Protected credentials', text: 'Staff sign-ins are lab-specific, every device can be removed remotely, and service keys are kept in an encrypted vault.' },
  ];

  track() {
    const tk = this.token.trim();
    if (!tk) return this.toast.warn('Enter the token from your receipt.');
    if (tk) this.router.navigate(['/track', tk.toUpperCase()]);
  }
}
