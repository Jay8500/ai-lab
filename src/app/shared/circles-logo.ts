import { Component, input } from '@angular/core';

/** Circles (SpreadApps ticketing) mark. */
@Component({
  selector: 'app-circles-logo',
  template: `<img src="brand/circles-logo.svg" alt="Circles" [style.width.px]="size()" [style.height.px]="size()" class="shrink-0" />`,
})
export class CirclesLogo {
  readonly size = input(20);
}
