import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { CourierRate, RateInput, RateMeasurement, FreightQuote } from './rate.model';
@Injectable({ providedIn: 'root' })
export class RatesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/rates`;
  }
  list() {
    return this.http.get<{ rates: CourierRate[] }>(this.base).pipe(map((r) => r.rates));
  }
  current() {
    return this.http.get<CourierRate>(`${this.base}/current`);
  }
  create(input: RateInput) {
    return this.http.post<CourierRate>(this.base, input);
  }
  quote(input: RateMeasurement) {
    return this.http.post<FreightQuote>(`${this.base}/quote`, input);
  }
}
