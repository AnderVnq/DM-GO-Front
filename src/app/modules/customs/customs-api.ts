import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { CustomsLine, CustomsImportResult, DocumentKind } from './customs.model';
@Injectable({ providedIn: 'root' })
export class CustomsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/customs`;
  }
  pending() {
    return this.http
      .get<{ lines: CustomsLine[] }>(`${this.base}/lines`, {
        params: { pending: 'true', limit: 200 },
      })
      .pipe(
        timeout(20000),
        map((r) => {
          if (!Array.isArray(r.lines))
            throw new Error('No se pudo interpretar el listado de Aduanas. Vuelve a intentarlo.');
          return r.lines;
        }),
      );
  }
  get(id: string) {
    return this.http.get<CustomsLine>(`${this.base}/lines/${encodeURIComponent(id)}`);
  }
  importReport(file: File, manifest: string, mawb: string, airline: string) {
    const data = new FormData();
    data.append('file', file);
    data.append('customs_manifest', manifest.trim());
    data.append('mawb_number', mawb.trim());
    data.append('airline', airline.trim());
    return this.http.post<CustomsImportResult>(`${this.base}/reports`, data);
  }
  attach(id: string, type: DocumentKind, documentId: string) {
    return this.http.post<CustomsLine>(`${this.base}/lines/${encodeURIComponent(id)}/documents`, {
      type,
      document_id: documentId,
    });
  }
  release(id: string) {
    return this.http.post<CustomsLine>(`${this.base}/lines/${encodeURIComponent(id)}/release`, {});
  }
}
