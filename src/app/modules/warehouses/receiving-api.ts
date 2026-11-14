import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { Package } from '../shipments';
import type { ReceiveInput, ReceiveResult } from './receiving.model';

@Injectable({ providedIn: 'root' })
export class ReceivingApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return this.config.value.apiBaseUrl;
  }
  receive(input: ReceiveInput) {
    return this.http.post<ReceiveResult>(`${this.base}/warehouse/receipts`, input);
  }
  unidentified() {
    return this.http
      .get<{ packages: Package[] }>(`${this.base}/warehouse/unidentified`)
      .pipe(map((response) => response.packages));
  }
  assign(packageId: string, customerId: string) {
    return this.http.post<Package>(
      `${this.base}/packages/${encodeURIComponent(packageId)}/assign`,
      { customer_id: customerId },
    );
  }
}
