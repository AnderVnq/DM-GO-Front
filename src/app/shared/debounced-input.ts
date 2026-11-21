import { DestroyRef, Directive, HostListener, inject, input, output } from '@angular/core';
@Directive({ selector: 'input[appDebouncedInput]' })
export class DebouncedInput {
  readonly focusSearch = input(false);
  readonly debouncedSearch = output<Event>();
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }
  @HostListener('input', ['$event']) input(event: Event) {
    if ('isComposing' in event && event.isComposing) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debouncedSearch.emit(event), 300);
  }
  @HostListener('compositionend', ['$event']) composed(event: Event) {
    this.input(event);
  }
  @HostListener('focus', ['$event']) focus(event: FocusEvent) {
    if (this.focusSearch()) this.debouncedSearch.emit(event);
  }
  @HostListener('keydown.enter') enter() {
    clearTimeout(this.timer);
  }
}
