import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { DeliveryRoute, RouteStop } from './delivery-route.model';
export interface DriverIdentity {
  id: string;
  name: string;
  email: string;
}
export interface DriverResolution {
  package_ids: string[];
  evidence_document_ids: string[];
  latitude?: number;
  longitude?: number;
  receiver?: { name: string; doc_type: string; doc_number: string };
  agency_guide_number?: string;
  reason?: string;
}
@Injectable({ providedIn: 'root' })
export class DriverApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/driver`;
  }
  register() {
    return this.http.get<DriverIdentity>(`${this.base}/me`);
  }
  routes(date: string) {
    return this.http
      .get<{ routes: DeliveryRoute[] }>(`${this.base}/routes`, { params: { date } })
      .pipe(map((r) => r.routes));
  }
  resolve(id: string, action: 'deliver' | 'fail', input: DriverResolution) {
    return this.http.post<RouteStop>(
      `${this.base}/stops/${encodeURIComponent(id)}/${action}`,
      input,
    );
  }
}
