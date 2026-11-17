import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RuntimeConfig } from '../../core/runtime-config';
import type { Reception, ReceptionMawb, ScanInput, ScanResult } from './reception.model';
@Injectable({ providedIn: 'root' })
export class ReceptionsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return this.config.value.apiBaseUrl;
  }
  get(id: string) {
    return this.http.get<Reception>(`${this.base}/receptions/${encodeURIComponent(id)}`);
  }
  mawb(id: string) {
    return this.http.get<ReceptionMawb>(`${this.base}/mawbs/${encodeURIComponent(id)}`);
  }
  open(mawbId: string, warehouseCode: string) {
    return this.http.post<Reception>(`${this.base}/receptions`, {
      mawb_id: mawbId,
      warehouse_code: warehouseCode,
    });
  }
  scan(id: string, input: ScanInput) {
    return this.http.post<ScanResult>(
      `${this.base}/receptions/${encodeURIComponent(id)}/scans`,
      input,
    );
  }
  close(id: string) {
    return this.http.post<Reception>(`${this.base}/receptions/${encodeURIComponent(id)}/close`, {});
  }
}
