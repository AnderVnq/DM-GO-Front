import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RuntimeConfig } from '../../core/runtime-config';
import type { Bulk, BulkClosure, Consolidation } from './consolidation.model';

@Injectable({ providedIn: 'root' })
export class ConsolidationApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return this.config.value.apiBaseUrl;
  }
  createBulk(warehouseCode: string) {
    return this.http.post<Bulk>(`${this.base}/bulks`, { warehouse_code: warehouseCode });
  }
  bulk(id: string) {
    return this.http.get<Bulk>(`${this.base}/bulks/${encodeURIComponent(id)}`);
  }
  addPackage(id: string, packageId: string) {
    return this.http.post<Bulk>(`${this.base}/bulks/${encodeURIComponent(id)}/packages`, {
      package_id: packageId,
    });
  }
  removePackage(id: string, packageId: string, reason: string) {
    return this.http.post<Bulk>(
      `${this.base}/bulks/${encodeURIComponent(id)}/packages/${encodeURIComponent(packageId)}/remove`,
      { reason },
    );
  }
  closeBulk(id: string, input: BulkClosure) {
    return this.http.post<Bulk>(`${this.base}/bulks/${encodeURIComponent(id)}/close`, input);
  }
  bulkLabel(id: string) {
    return this.http.get(`${this.base}/bulks/${encodeURIComponent(id)}/label.pdf`, {
      responseType: 'blob',
    });
  }
  createConsolidation(warehouseCode: string) {
    return this.http.post<Consolidation>(`${this.base}/consolidations`, {
      warehouse_code: warehouseCode,
    });
  }
  consolidation(id: string) {
    return this.http.get<Consolidation>(`${this.base}/consolidations/${encodeURIComponent(id)}`);
  }
  addBulk(id: string, bulkId: string) {
    return this.http.post<Consolidation>(
      `${this.base}/consolidations/${encodeURIComponent(id)}/bulks`,
      { bulk_id: bulkId },
    );
  }
  closeConsolidation(id: string) {
    return this.http.post<Consolidation>(
      `${this.base}/consolidations/${encodeURIComponent(id)}/close`,
      {},
    );
  }
}
