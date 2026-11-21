import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type {
  CreateRouteInput,
  DeliveryDriver,
  DeliveryRoute,
  RouteStop,
} from './delivery-route.model';
@Injectable({ providedIn: 'root' })
export class DeliveryRoutesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return this.config.value.apiBaseUrl;
  }
  list(query: string | { from?: string; to?: string }) {
    const params = typeof query === 'string' ? { date: query } : query;
    return this.http
      .get<{ routes: DeliveryRoute[] }>(`${this.base}/routes`, { params })
      .pipe(map((r) => r.routes));
  }
  get(id: string) {
    return this.http.get<DeliveryRoute>(`${this.base}/routes/${encodeURIComponent(id)}`);
  }
  drivers() {
    return this.http
      .get<{ drivers: DeliveryDriver[] }>(`${this.base}/drivers`)
      .pipe(map((r) => r.drivers));
  }
  create(input: CreateRouteInput) {
    return this.http.post<DeliveryRoute>(`${this.base}/routes`, input);
  }
  add(id: string, packageId: string) {
    return this.http.post<DeliveryRoute>(`${this.base}/routes/${encodeURIComponent(id)}/stops`, {
      package_id: packageId,
    });
  }
  start(id: string) {
    return this.http.post<DeliveryRoute>(`${this.base}/routes/${encodeURIComponent(id)}/start`, {});
  }
  complete(id: string) {
    return this.http.post<DeliveryRoute>(
      `${this.base}/routes/${encodeURIComponent(id)}/complete`,
      {},
    );
  }
  fail(stopId: string, ids: string[], reason: string) {
    return this.http.post<RouteStop>(
      `${this.base}/route-stops/${encodeURIComponent(stopId)}/fail`,
      { package_ids: ids, reason: reason.trim() },
    );
  }
}
