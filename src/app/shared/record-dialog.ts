import {
  Component,
  ElementRef,
  DestroyRef,
  inject,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Icon } from './icon';
import { LoadingIndicator } from './loading-indicator';
let sequence = 0;
/** Conserva el listado montado y presenta su ficha en la capa modal nativa. */
@Component({
  selector: 'app-record-dialog',
  imports: [Icon, LoadingIndicator],
  template: `
    <dialog
      #dialog
      class="record-dialog"
      [attr.aria-labelledby]="uid"
      [attr.closedby]="locked() ? 'none' : 'closerequest'"
      (cancel)="cancel($event)"
      (close)="closed()"
    >
      <div class="dialog-header record-dialog-header">
        <h2 [id]="uid">{{ title() }}</h2>
        <button
          type="button"
          class="icon-button"
          aria-label="Cerrar detalle"
          title="Cerrar detalle"
          autofocus
          [disabled]="locked()"
          (click)="dismiss()"
        >
          <app-icon name="close" />
        </button>
      </div>
      @if (error()) {
        <p class="alert error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="alert success" role="status">{{ notice() }}</p>
      }
      <app-loading-indicator [active]="loading()" label="Actualizando detalle…" />
      <ng-content />
    </dialog>
  `,
  styles: `
    :host {
      display: contents;
    }
    dialog.record-dialog {
      width: min(76rem, calc(100% - 2rem));
      max-width: calc(100% - 2rem);
      height: min(48rem, calc(100dvh - 2rem));
      max-height: calc(100dvh - 2rem);
      padding: 1.5rem;
      overscroll-behavior: contain;
    }
    .record-dialog-header {
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .record-dialog-header h2 {
      margin: 0;
      font-size: 1.125rem;
      color: var(--muted);
      font-weight: 500;
    }
    @media (max-width: 700px) {
      dialog.record-dialog {
        width: calc(100% - 1rem);
        max-width: calc(100% - 1rem);
        max-height: calc(100dvh - 1rem);
        padding: 1rem;
      }
    }
  `,
})
export class RecordDialog {
  readonly open = input.required<boolean>();
  readonly title = input('Detalle del registro');
  readonly locked = input(false);
  readonly loading = input(false);
  readonly error = input('');
  readonly notice = input('');
  readonly dismissed = output<void>();
  readonly uid = `record-dialog-${++sequence}`;
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private closing = false;
  private notified = false;
  private readonly destroy = inject(DestroyRef);
  constructor() {
    afterRenderEffect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        this.notified = false;
        element.removeAttribute('data-closing');
        element.removeAttribute('data-motion-finished');
        element.showModal?.();
      } else if (!this.open() && element.open) element.close();
    });
  }
  cancel(event: Event) {
    event.preventDefault();
    void this.dismiss();
  }
  async dismiss() {
    if (this.locked() || this.closing) return;
    const element = this.dialog().nativeElement;
    this.closing = true;
    // Mantener el contenido y la capa modal durante el fundido también en Safari/Firefox.
    element.setAttribute('data-closing', '');
    const animations = element.getAnimations?.() ?? [];
    await Promise.race([
      Promise.allSettled(animations.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 350)),
    ]);
    if (this.destroy.destroyed) return;
    if (this.locked()) {
      element.removeAttribute('data-closing');
      this.closing = false;
      return;
    }
    element.setAttribute('data-motion-finished', '');
    element.close();
    this.closed();
    this.closing = false;
  }
  closed() {
    this.dialog().nativeElement.returnValue = '';
    if (this.open() && !this.notified) {
      this.notified = true;
      this.dismissed.emit();
    }
  }
}
