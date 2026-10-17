import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/**
 * One form field: label (+ red * when required), the projected control, then either
 * the error message (red, with icon) or the helper text. Put the control inside:
 *
 *   <app-field label="Patient name" required [error]="errors().name" hint="As on their ID">
 *     <input class="input" ... />
 *   </app-field>
 *
 * When `error` is set, any `.input` inside turns red (see .field-invalid in styles.css).
 */
@Component({
  selector: 'app-field',
  imports: [LucideAngularModule],
  host: { class: 'block', '[class.field-invalid]': '!!error()' },
  template: `
    @if (label()) {
      <label class="mb-1.5 flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-600" [attr.for]="for() || null">
        {{ label() }}
        @if (required()) {
          <span class="text-rose-500" aria-hidden="true">*</span><span class="sr-only">(required)</span>
        } @else if (optional()) {
          <span class="font-normal text-slate-400">(optional)</span>
        }
        @if (counter()) {
          <span class="ml-auto font-normal tabular-nums" [class]="counterOver() ? 'text-rose-500' : 'text-slate-400'">{{ counter() }}</span>
        }
      </label>
    }
    <ng-content />
    @if (error()) {
      <p class="animate-fade-in mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600" role="alert">
        <lucide-icon name="circle-x" class="mt-px size-3.5 shrink-0" />
        <span>{{ error() }}</span>
      </p>
    } @else if (hint()) {
      <p class="mt-1.5 text-xs text-slate-400">{{ hint() }}</p>
    }
  `,
})
export class FormField {
  readonly label = input('');
  readonly for = input('');
  readonly required = input(false, { transform: (v: boolean | string) => v === '' || v === true || v === 'true' });
  readonly optional = input(false, { transform: (v: boolean | string) => v === '' || v === true || v === 'true' });
  readonly hint = input('');
  readonly error = input<string | null | undefined>(null);
  /** e.g. "42 / 120" */
  readonly counter = input('');
  readonly counterOver = input(false);
}
