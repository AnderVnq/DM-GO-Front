import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { Warehouse, WarehouseInput, WarehousePatch } from './warehouse.model';

@Injectable({ providedIn: 'root' })
export class WarehousesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/warehouses`;
  }
  list(includeInactive = false) {
    return this.http
      .get<{ warehouses: Warehouse[] }>(this.base, {
        params: { include_inactive: String(includeInactive) },
      })
      .pipe(map((response) => response.warehouses));
  }
  create(input: WarehouseInput) {
    return this.http.post<Warehouse>(this.base, input);
  }
  update(id: string, input: WarehousePatch) {
    return this.http.patch<Warehouse>(`${this.base}/${encodeURIComponent(id)}`, input);
  }
}
