import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RuntimeConfig } from '../../core/runtime-config';
import type { Consignee, ConsigneeInput, ConsigneeUsage } from './consignee.model';

@Injectable({ providedIn: 'root' })
export class PortalConsigneesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/portal`;
  }
  list() {
    return this.http.get<{ consignees: Consignee[]; consent_text: string }>(
      `${this.base}/consignees`,
    );
  }
  create(input: ConsigneeInput) {
    return this.http.post<Consignee>(`${this.base}/consignees`, input);
  }
  remove(id: string) {
    return this.http.delete<void>(`${this.base}/consignees/${encodeURIComponent(id)}`);
  }
  usage(id: string) {
    return this.http.get<ConsigneeUsage>(`${this.base}/consignees/${encodeURIComponent(id)}/usage`);
  }
  assign(packageId: string, consigneeId: string) {
    return this.http.put<ConsigneeUsage>(
      `${this.base}/packages/${encodeURIComponent(packageId)}/consignee`,
      { consignee_id: consigneeId },
    );
  }
}
