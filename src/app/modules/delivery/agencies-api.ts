import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { TransitAgency, AgencyBranch, AgencyInput, BranchInput } from './agency.model';
@Injectable({ providedIn: 'root' })
export class AgenciesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/agencies`;
  }
  list(all: boolean) {
    return this.http
      .get<{ agencies: TransitAgency[] }>(this.base, { params: { all: String(all) } })
      .pipe(map((r) => r.agencies));
  }
  create(input: AgencyInput) {
    return this.http.post<TransitAgency>(this.base, input);
  }
  addBranch(id: string, input: BranchInput) {
    return this.http.post<AgencyBranch>(`${this.base}/${encodeURIComponent(id)}/branches`, input);
  }
}
