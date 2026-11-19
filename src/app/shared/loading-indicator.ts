import { Component, input } from '@angular/core';

/** Reserva espacio para que las recargas no desplacen el contenido. */
@Component({
  selector: 'app-loading-indicator',
  host: { '[class.loading-active]': 'active()' },
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
      justify-content: center;
      gap: 0.625rem;
      color: var(--muted);
      font-size: 0.8125rem;
    }
    :host(.loading-active) .loading-slot {
      position: absolute;
      inset: 0;
      z-index: 5;
      height: 100%;
      flex-direction: column;
      text-align: center;
      padding: 1rem;
      background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
      border-radius: inherit;
    }
    :host(.loading-active) progress {
      width: 1.75rem;
      height: 1.75rem;
    }
  `,
})
export class LoadingIndicator {
  readonly active = input(false);
  readonly label = input('Actualizando…');
}
