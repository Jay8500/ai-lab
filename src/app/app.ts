import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { installTypingRules } from './core/text-clean';
import { DialogHost } from './shared/dialog-host';
import { ToastHost } from './shared/toast-host';
import { UpdateBanner } from './shared/update-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, DialogHost, UpdateBanner],
  template: `<router-outlet /><app-toast-host /><app-dialog-host /><app-update-banner />`,
})
export class App {
  constructor() {
    // App-wide: no leading/double spaces in any text field (see core/text-clean.ts)
    installTypingRules(inject(DOCUMENT));
  }
}
