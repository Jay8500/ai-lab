import { Component, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-upload-dropzone',
  imports: [LucideAngularModule],
  template: `
    <label
      class="group flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-3.5 py-3 transition"
      [class]="{ 'border-brand': over(), 'bg-brand/5': over(), 'border-slate-200': !over() && !fileName(), 'hover:border-slate-300': !over() && !fileName(), 'border-emerald-200': !over() && !!fileName(), 'bg-emerald-50/50': !over() && !!fileName(), 'pointer-events-none': busy() }"
      (dragover)="$event.preventDefault(); over.set(true)"
      (dragleave)="over.set(false)"
      (drop)="onDrop($event)"
    >
      <input type="file" accept="application/pdf" class="sr-only" (change)="onPick($event)" [disabled]="busy()" />
      <span class="grid size-9 shrink-0 place-items-center rounded-lg"
            [class.bg-emerald-100]="!!fileName()" [class.text-emerald-600]="!!fileName()"
            [class.bg-slate-100]="!fileName()" [class.text-slate-500]="!fileName()">
        @if (busy()) {
          <lucide-icon name="loader-circle" class="size-4 animate-spin" />
        } @else {
          <lucide-icon [name]="fileName() ? 'file-check' : 'cloud-upload'" class="size-4" />
        }
      </span>
      <span class="min-w-0 flex-1 text-xs">
        @if (busy()) {
          <span class="font-semibold text-slate-600">Uploading…</span>
        } @else if (fileName()) {
          <span class="block truncate font-semibold text-emerald-700">{{ fileName() }}</span>
          <span class="text-slate-400">Tap to replace PDF</span>
        } @else {
          <span class="block font-semibold text-slate-600">Drop report PDF or <span class="text-brand">browse</span></span>
          <span class="text-slate-400">PDF up to 20 MB</span>
        }
      </span>
    </label>
  `,
})
export class UploadDropzone {
  readonly fileName = input<string | null>(null);
  readonly busy = input(false);
  readonly file = output<File>();
  protected readonly over = signal(false);

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.over.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.file.emit(f);
  }

  onPick(e: Event) {
    const el = e.target as HTMLInputElement;
    const f = el.files?.[0];
    if (f) this.file.emit(f);
    el.value = '';
  }
}
