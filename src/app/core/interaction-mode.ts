import { DOCUMENT } from '@angular/common';
import { Directive, inject } from '@angular/core';

@Directive({
  selector: '[appInteractionMode]',
  host: {
    '(document:keydown)': 'keyboard()',
    '(document:pointerdown)': 'pointer()',
  },
})
export class InteractionMode {
  private readonly document = inject(DOCUMENT);
  keyboard() {
    this.document.documentElement.dataset['interaction'] = 'keyboard';
  }
  pointer() {
    this.document.documentElement.dataset['interaction'] = 'pointer';
  }
}
