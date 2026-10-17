import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { installTypingRules } from './core/text-clean';
import { ToastHost } from './shared/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost],
  template: `<router-outlet /><app-toast-host />`,
})
export class App {
  constructor() {
    // App-wide: no leading/double spaces in any text field (see core/text-clean.ts)
    installTypingRules(inject(DOCUMENT));
  }
}
