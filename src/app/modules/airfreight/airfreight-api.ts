import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RuntimeConfig } from '../../core/runtime-config';
import type {
  Mawb,
  MawbInput,
  DispatchResult,
  Manifest,
  FlightConsolidation,
} from './airfreight.model';

@Injectable({ providedIn: 'root' })
export class AirfreightApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return this.config.value.apiBaseUrl;
  }
  create(input: MawbInput) {
    return this.http.post<Mawb>(`${this.base}/mawbs`, input);
  }
  get(id: string) {
    return this.http.get<Mawb>(`${this.base}/mawbs/${encodeURIComponent(id)}`);
  }
  consolidation(id: string) {
    return this.http.get<FlightConsolidation>(
      `${this.base}/consolidations/${encodeURIComponent(id)}`,
    );
  }
  manifest(id: string) {
    return this.http.get<Manifest>(
      `${this.base}/consolidations/${encodeURIComponent(id)}/manifest`,
    );
  }
  manifestCsv(id: string) {
    return this.http.get(`${this.base}/consolidations/${encodeURIComponent(id)}/manifest`, {
      params: { format: 'csv' },
      responseType: 'blob',
    });
  }
  attach(id: string, consolidationId: string) {
    return this.http.post<Mawb>(`${this.base}/mawbs/${encodeURIComponent(id)}/consolidations`, {
      consolidation_id: consolidationId,
    });
  }
  dispatch(id: string) {
    return this.http.post<DispatchResult>(
      `${this.base}/mawbs/${encodeURIComponent(id)}/dispatch`,
      {},
    );
  }
}
