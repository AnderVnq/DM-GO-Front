import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import { type Package, type PrealertInput, type TrackingResponse } from './package.model';

@Injectable({ providedIn: 'root' })
export class ShipmentsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/packages`;
  }
  list(customerId: string) {
    if (!customerId) throw new Error('Selecciona un cliente para consultar sus paquetes.');
    return this.http
      .get<{ packages: Package[] }>(this.base, { params: { customer_id: customerId } })
      .pipe(map((data) => data.packages));
  }
  get(id: string) {
    return this.http.get<Package>(`${this.base}/${encodeURIComponent(id)}`);
  }
  tracking(id: string) {
    return this.http.get<TrackingResponse>(`${this.base}/${encodeURIComponent(id)}/tracking`);
  }
  prealert(input: PrealertInput) {
    return this.http.post<Package>(this.base, input);
  }
  attachInvoice(id: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<Package>(`${this.base}/${encodeURIComponent(id)}/invoice`, body);
  }
}
