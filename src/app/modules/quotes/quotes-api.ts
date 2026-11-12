import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import { type Quote, type QuoteInput } from './quote.model';

@Injectable({ providedIn: 'root' })
export class QuotesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/quotes`;
  }
  list(filter: { status?: string; customer_id?: string; limit?: number } = {}) {
    const params = Object.fromEntries(
      Object.entries({ limit: 50, ...filter }).filter(
        ([, value]) => value !== '' && value !== undefined,
      ),
    );
    return this.http
      .get<{ quotes: Quote[] }>(this.base, { params })
      .pipe(map((data) => data.quotes));
  }
  get(id: string) {
    return this.http.get<Quote>(`${this.base}/${encodeURIComponent(id)}`);
  }
  create(input: QuoteInput) {
    return this.http.post<Quote>(this.base, input);
  }
  pdf(id: string) {
    return this.http.get(`${this.base}/${encodeURIComponent(id)}/pdf`, { responseType: 'blob' });
  }
}
