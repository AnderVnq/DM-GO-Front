import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RuntimeConfig } from '../../core/runtime-config';
import { type CreateCustomerInput, type Customer } from './customer.model';

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/customers`;
  }

  findByLocker(code: string) {
    return this.http.get<Customer>(this.base, {
      params: { locker_code: code.trim().toUpperCase() },
    });
  }
  findByDocument(type: 'dni' | 'ruc', number: string) {
    return this.http.get<Customer>(this.base, {
      params: { doc_type: type, doc_number: number.trim() },
    });
  }
  get(id: string) {
    return this.http.get<Customer>(`${this.base}/${encodeURIComponent(id)}`);
  }
  create(input: CreateCustomerInput) {
    return this.http.post<Customer>(this.base, input);
  }
  updateContact(id: string, input: { email: string; phone: string }) {
    return this.http.patch<Customer>(`${this.base}/${encodeURIComponent(id)}/contact`, input);
  }
}
