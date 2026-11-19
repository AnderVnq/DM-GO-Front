import { Component, input } from '@angular/core';

/** Reserva espacio para que las recargas no desplacen el contenido. */
@Component({
  selector: 'app-loading-indicator',
  template: `
    <div class="loading-slot" [class.active]="active()">
      @if (active()) {
        <progress class="loading-spinner" [attr.aria-label]="label()"></progress>
        <span aria-hidden="true">{{ label() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .loading-slot {
      min-height: 2rem;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      color: var(--muted);
      font-size: 0.8125rem;
    }
  `,
})
export class LoadingIndicator {
  readonly active = input(false);
  readonly label = input('Actualizando…');
}
