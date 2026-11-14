import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { Package } from '../shipments';
import type { DeliveryAgency, DeliveryPreference } from './delivery.model';

@Injectable({ providedIn: 'root' })
export class PortalDeliveryApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/portal`;
  }
  agencies() {
    return this.http
      .get<{ agencies: DeliveryAgency[] }>(`${this.base}/agencies`)
      .pipe(map((r) => r.agencies));
  }
  save(id: string, input: DeliveryPreference) {
    return this.http.put<Package>(
      `${this.base}/packages/${encodeURIComponent(id)}/delivery`,
      input,
    );
  }
}
