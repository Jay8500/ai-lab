import { DatePipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { LabService } from '../core/lab.service';
import { Visit, VisitStatus } from '../core/models';
import { ToastService } from '../core/toast.service';
import { AiStatus } from './ai-explanation';
import { StatusPill } from './status-pill';
import { UploadDropzone } from './upload-dropzone';
import { ReceiptService } from '../core/receipt.service';

const NEXT: Partial<Record<VisitStatus, { to: VisitStatus; label: string }>> = {
  collected: { to: 'in_lab', label: 'Start testing' },
  in_lab: { to: 'verified', label: 'Mark verified' },
};

@Component({
  selector: 'app-patient-card',
  imports: [LucideAngularModule, DatePipe, StatusPill, UploadDropzone, AiStatus],
  template: `
    @let v = visit();
    <article class="card animate-fade-up flex h-full flex-col p-4 transition hover:shadow-md">
      <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-mono text-[11px] font-bold tracking-wider text-brand">#{{ v.token }}</p>
          <h3 class="mt-0.5 truncate text-[15px] font-bold text-slate-800">{{ v.patient_name }}</h3>
          <p class="mt-0.5 text-xs text-slate-400">
            {{ v.age ?? '—' }}{{ v.gender ? ' · ' + v.gender : '' }}
            @if (v.mobile) { · {{ v.mobile }} }
            · {{ v.created_at | date: 'h:mm a' }}
          </p>
        </div>
        <app-status-pill [status]="v.status" />
      </header>

      <div class="mt-3 flex flex-wrap gap-1.5">
        @for (t of v.tests; track t.code) {
          <span class="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100" [title]="t.name">{{ t.code }}</span>
        }
      </div>

      <div class="mt-auto space-y-2.5 pt-4">
        @if (next(); as n) {
          <button class="btn-ghost w-full py-2! text-xs" (click)="advance(n.to)" [disabled]="working()">
            <lucide-icon name="flask-conical" class="size-3.5" /> {{ n.label }}
          </button>
        }

        <app-upload-dropzone [fileName]="v.report_name" [busy]="uploading()" (file)="upload($event)" />
        @if (v.report_path) { <app-ai-status [visit]="v" /> }

        <div class="flex gap-2">
          <button
            class="btn-success flex-1 py-2! text-xs"
            [disabled]="!v.report_path || working()"
            (click)="notify()"
            [title]="v.report_path ? 'Send report link on WhatsApp' : 'Upload the PDF first'"
          >
            <lucide-icon [name]="v.notified_at ? 'check' : 'send'" class="size-3.5" />
            {{ v.notified_at ? 'Sent · resend' : 'Notify / Share' }}
          </button>
          @if (v.report_path) {
            <a class="btn-ghost px-3! py-2!" [href]="lab.reportUrl(v)" target="_blank" rel="noopener" title="Open PDF">
              <lucide-icon name="eye" class="size-3.5" />
            </a>
          }
          <button class="btn-ghost px-3! py-2!" (click)="copyLink()" title="Copy tracking link">
            <lucide-icon name="copy" class="size-3.5" />
          </button>
          <button class="btn-ghost px-3! py-2!" (click)="lab.historyFor.set(v)" title="Patient history">
            <lucide-icon name="history" class="size-3.5" />
          </button>
          <button class="btn-ghost px-3! py-2!" (click)="receipt.print(v)" title="Print receipt">
            <lucide-icon name="printer" class="size-3.5" />
          </button>
        </div>
      </div>
    </article>
  `,
})
export class PatientCard {
  readonly visit = input.required<Visit>();
  protected readonly lab = inject(LabService);
  private readonly toast = inject(ToastService);
  protected readonly receipt = inject(ReceiptService);
  protected readonly uploading = signal(false);
  protected readonly working = signal(false);

  protected next() {
    return NEXT[this.visit().status] ?? null;
  }

  async advance(to: VisitStatus) {
    this.working.set(true);
    try {
      await this.lab.setStatus(this.visit(), to);
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.working.set(false);
    }
  }

  async upload(file: File) {
    this.uploading.set(true);
    try {
      await this.lab.uploadReport(this.visit(), file);
      this.toast.success(`Report uploaded for ${this.visit().patient_name}`);
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.uploading.set(false);
    }
  }

  async notify() {
    const v = this.visit();
    const text = this.lab.shareText(v);
    // Phones: native share sheet; desktop / no mobile: WhatsApp click-to-chat
    if (!v.mobile && navigator.share) {
      try {
        await navigator.share({ title: 'Lab report', text });
      } catch {
        return;
      }
    } else {
      window.open(this.lab.whatsappLink(v), '_blank', 'noopener');
    }
    this.working.set(true);
    try {
      await this.lab.markNotified(v);
    } catch (e) {
      this.toast.fail(e);
    } finally {
      this.working.set(false);
    }
  }

  async copyLink() {
    await navigator.clipboard.writeText(this.lab.trackUrl(this.visit()));
    this.toast.success('Tracking link copied');
  }
}
