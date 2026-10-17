import { Component, computed, input, signal } from '@angular/core';
import { initialsOf } from '../core/models';

/** Profile photo, or two-letter initials when there is none (or it fails to load). */
@Component({
  selector: 'app-avatar',
  template: `
    @if (url() && !broken()) {
      <img [src]="url()" alt="" class="rounded-full object-cover ring-2 ring-white"
           [style.width.px]="size()" [style.height.px]="size()" (error)="broken.set(true)" />
    } @else {
      <span class="grid place-items-center rounded-full bg-brand/10 font-bold text-brand ring-2 ring-white"
            [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.36">{{ initials() }}</span>
    }
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Avatar {
  readonly name = input<string | null | undefined>('');
  readonly url = input<string | null | undefined>(null);
  readonly size = input(36);
  protected readonly broken = signal(false);
  protected readonly initials = computed(() => initialsOf(this.name()));
}
