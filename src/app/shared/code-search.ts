import { Component, DestroyRef, forwardRef, inject, input, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, timeout } from 'rxjs';
import { RuntimeConfig } from '../core/runtime-config';
import { requestMessage } from '../core/api-problem';
export interface CodeSelection {
  id: string;
  code: string;
  name: string;
}
let sequence = 0;
@Component({
  selector: 'app-code-search',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeSearch), multi: true },
  ],
  template: `<input
      [id]="uid"
      type="search"
      role="combobox"
      autocomplete="off"
      maxlength="100"
      [attr.aria-label]="label()"
      [attr.aria-controls]="uid + '-options'"
      [attr.aria-expanded]="open()"
      aria-autocomplete="list"
      [attr.aria-activedescendant]="open() && active() >= 0 ? uid + '-' + active() : null"
      [value]="value"
      [disabled]="disabled"
      [placeholder]="placeholder()"
      (focus)="focus()"
      (input)="change($any($event.target).value)"
      (keydown)="key($event)"
      (blur)="blur()"
    />
    @if (open()) {
      <div class="suggestions">
        @if (loading()) {
          <p class="search-state">
            <progress class="loading-spinner" aria-label="Buscando resultados"></progress>Buscando…
          </p>
        }
        @if (error()) {
          <p class="search-state" role="status">{{ error() }}</p>
        }
        <ul [id]="uid + '-options'" role="listbox" aria-label="Resultados sugeridos">
          @for (row of rows(); track row.id; let i = $index) {
            <li
              role="option"
              [id]="uid + '-' + i"
              [attr.aria-selected]="active() === i"
              [class.active]="active() === i"
              (mousedown)="$event.preventDefault()"
              (click)="choose(row)"
            >
              <strong>{{ row.code }}</strong><span>{{ row.name }}</span>
            </li>
          }
        </ul>
        @if (!loading() && !error() && !rows().length) {
          <p class="search-state">No hay coincidencias. Prueba con otro nombre o código.</p>
        }
      </div>
    }`,
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
    }
    input {
      width: 100%;
      min-height: 2.75rem;
      padding: 0.65rem 0.8rem;
      border: 1px solid var(--control-border);
      border-radius: 0.5rem;
      background: var(--field-background);
      color: var(--text);
      font: inherit;
    }
    .suggestions {
      position: absolute;
      inset-inline: 0;
      top: calc(100% + 0.375rem);
      z-index: 60;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      box-shadow: var(--shadow-float);
      max-height: 18rem;
      overflow: auto;
    }
    ul {
      margin: 0;
      padding: 0.25rem;
      list-style: none;
    }
    li {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      min-height: 44px;
      padding: 0.65rem;
      cursor: pointer;
      border-radius: 0.35rem;
    }
    li:hover,
    li.active {
      background: var(--selection);
    }
    li span {
      font-size: 0.8125rem;
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .search-state {
      padding: 0.75rem;
      margin: 0;
      font-size: 0.8125rem;
      display: flex;
      gap: 0.5rem;
      justify-content: center;
      align-items: center;
      min-height: 4rem;
    }
  `,
})
export class CodeSearch implements ControlValueAccessor {
  readonly resource = input('customers');
  readonly label = input('Buscar por nombre o código');
  readonly placeholder = input('Nombre o código');
  readonly picked = output<CodeSelection>();
  readonly open = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<CodeSelection[]>([]);
  readonly active = signal(-1);
  readonly uid = `code-search-${++sequence}`;
  value = '';
  disabled = false;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private timer?: ReturnType<typeof setTimeout>;
  private blurTimer?: ReturnType<typeof setTimeout>;
  private request?: Subscription;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      clearTimeout(this.blurTimer);
      this.request?.unsubscribe();
    });
  }
  writeValue(value: string | null) {
    this.value = value ?? '';
  }
  registerOnChange(fn: (v: string) => void) {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean) {
    this.disabled = disabled;
    if (disabled) this.open.set(false);
  }
  focus() {
    if (this.disabled) return;
    clearTimeout(this.blurTimer);
    this.open.set(true);
    this.load();
  }
  blur() {
    this.onTouched();
    this.blurTimer = setTimeout(() => this.open.set(false), 150);
  }
  change(value: string) {
    this.value = value;
    this.onChange(value);
    this.open.set(true);
    this.active.set(-1);
    this.rows.set([]);
    this.error.set('');
    this.request?.unsubscribe();
    clearTimeout(this.timer);
    this.loading.set(true);
    this.timer = setTimeout(() => this.load(), 300);
  }
  private load() {
    clearTimeout(this.timer);
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.active.set(-1);
    this.request = this.http
      .get<Record<string, unknown>>(`${this.config.value.apiBaseUrl}/${this.resource()}`, {
        params: { q: this.value.trim(), limit: 8, offset: 0 },
      })
      .pipe(timeout(15000))
      .subscribe({
        next: (page) => {
          const values = page[this.resource().split('/').at(-1)!];
          if (!Array.isArray(values)) {
            this.rows.set([]);
            this.error.set('No se pudo leer el listado. Vuelve a enfocar el buscador.');
          } else
            this.rows.set(
              values.map((row: Record<string, unknown>) => ({
                id: String(row['id']),
                code: String(
                  row['locker_code'] ??
                    row['code'] ??
                    row['number'] ??
                    row['guide'] ??
                    row['carrier_tracking'] ??
                    'Sin código',
                ),
                name: String(
                  row['name'] ??
                    row['driver_name'] ??
                    row['description'] ??
                    row['flight_number'] ??
                    row['customs_manifest'] ??
                    '',
                ),
              })),
            );
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.rows.set([]);
          this.error.set(requestMessage(e));
        },
      });
  }
  choose(row: CodeSelection) {
    if (this.disabled || this.loading()) return;
    this.value = row.code;
    this.onChange(row.code);
    this.open.set(false);
    this.picked.emit(row);
  }
  key(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      this.open.set(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) this.focus();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.active.set(
        this.rows().length
          ? Math.max(0, Math.min(this.rows().length - 1, this.active() + step))
          : -1,
      );
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.resource() === 'customers' && /^PE\d+$/i.test(this.value.trim())) {
        event.preventDefault();
        clearTimeout(this.timer);
        this.request?.unsubscribe();
        this.loading.set(false);
        this.choose({ id: '', code: this.value.trim().toUpperCase(), name: '' });
        return;
      }

      event.preventDefault();
      const row = this.rows()[Math.max(0, this.active())];
      if (row && this.open()) this.choose(row);
      else if (!this.open()) this.focus();
    }
  }
}
