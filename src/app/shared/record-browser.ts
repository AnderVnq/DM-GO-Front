import { Icon } from './icon';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { RuntimeConfig } from '../core/runtime-config';
import { requestMessage } from '../core/api-problem';
import { formatDate } from './amount';

export interface RecordColumn {
  key: string;
  label: string;
  date?: boolean;
}
interface RecordRow {
  id: string;
  [key: string]: unknown;
}
interface RecordPage {
  total: number;
  limit: number;
  offset: number;
  [key: string]: unknown;
}
let nextBrowserId = 0;

/** Tabla remota reutilizable. Los filtros y columnas pertenecen a la pantalla consumidora. */
@Component({
  selector: 'app-record-browser',
  imports: [FormsModule, Icon],
  templateUrl: './record-browser.html',
  styleUrl: './record-browser.scss',
})
export class RecordBrowser {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private request?: Subscription;
  readonly resource = input.required<string>();
  readonly title = input.required<string>();
  readonly columns = input.required<readonly RecordColumn[]>();
  readonly filters = input<Record<string, string>>({});
  readonly statuses = input<readonly { value: string; label: string }[]>([]);
  readonly disabled = input(false);
  readonly refresh = input(0);
  readonly action = input('Abrir');
  readonly hint = input('Busca por código');
  readonly empty = input('No hay registros que coincidan. Prueba con otros filtros.');
  readonly selected = output<string>();
  readonly rows = signal<RecordRow[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly uid = `records-${++nextBrowserId}`;
  readonly limit = 10;
  query = '';
  status = '';
  private appliedQuery = '';
  private appliedStatus = '';
  constructor() {
    effect(() => {
      this.resource();
      this.filters();
      this.refresh();
      this.load(0);
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }
  search(event?: Event) {
    event?.preventDefault();
    if (this.disabled()) return;
    this.appliedQuery = this.query.trim();
    this.appliedStatus = this.status;
    this.load(0);
  }
  load(offset = this.offset()) {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.rows.set([]);
    this.offset.set(offset);
    this.request = this.http
      .get<RecordPage>(`${this.config.value.apiBaseUrl}/${this.resource()}`, {
        params: {
          q: this.appliedQuery,
          status: this.appliedStatus,
          ...this.filters(),
          limit: this.limit,
          offset,
        },
      })
      .subscribe({
        next: (page) => {
          const rows = page[this.resource()];
          if (!Array.isArray(rows) || !Number.isInteger(page.total)) {
            this.error.set('No se pudo interpretar el listado. Vuelve a intentarlo.');
          } else if (!rows.length && offset > 0 && page.total > 0) {
            this.load(Math.floor((page.total - 1) / this.limit) * this.limit);
            return;
          } else {
            this.rows.set(rows);
            this.total.set(page.total);
          }
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(requestMessage(error));
        },
      });
  }
  value(row: RecordRow, column: RecordColumn): string {
    const value = column.key
      .split('.')
      .reduce<unknown>(
        (v, key) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined),
        row,
      );
    if (column.date) return typeof value === 'string' ? formatDate(value) : '—';
    if (column.key === 'status')
      return this.statuses().find((s) => s.value === value)?.label ?? String(value ?? '—');
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '—';
  }
  choose(id: string) {
    if (!this.disabled() && !this.loading()) this.selected.emit(id);
  }
}
