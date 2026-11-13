import { Component, computed, inject } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { Icon } from './icon';

@Component({
  selector: 'app-theme-toggle',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="button theme-toggle"
      [attr.aria-label]="label()"
      [title]="label()"
      (click)="theme.toggle()"
    >
      <app-icon [name]="theme.mode() === 'dark' ? 'sun' : 'moon'" />
      <span class="theme-label">{{ theme.mode() === 'dark' ? 'Modo claro' : 'Modo oscuro' }}</span>
    </button>
  `,
  styles: [':host { display: inline-flex; flex-shrink: 0; }'],
})
export class ThemeToggle {
  readonly theme = inject(ThemeService);
  readonly label = computed(() =>
    this.theme.mode() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
  );
}
