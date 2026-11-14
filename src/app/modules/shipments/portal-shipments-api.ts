import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { Package, PrealertBatchInput, TrackingResponse } from './package.model';

@Injectable({ providedIn: 'root' })
export class PortalShipmentsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/portal`;
  }
  list() {
    return this.http
      .get<{ packages: Package[] }>(`${this.base}/packages`)
      .pipe(map((response) => response.packages));
  }
  tracking(id: string) {
    return this.http.get<TrackingResponse>(
      `${this.base}/packages/${encodeURIComponent(id)}/tracking`,
    );
  }
  prealertBatch(input: PrealertBatchInput) {
    return this.http
      .post<{ packages: Package[] }>(`${this.base}/prealerts/batch`, input)
      .pipe(map((data) => data.packages));
  }
  attachInvoice(id: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<Package>(`${this.base}/packages/${encodeURIComponent(id)}/invoice`, body);
  }
}
