import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RuntimeConfig } from '../../core/runtime-config';
import type { LinkRequest, OnboardingInput, PortalProfile } from './portal.model';

@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private get base() {
    return `${this.config.value.apiBaseUrl}/portal`;
  }
  me() {
    return this.http.get<PortalProfile>(`${this.base}/me`);
  }
  onboard(input: OnboardingInput) {
    return this.http.post<PortalProfile>(`${this.base}/onboarding`, input);
  }
  linkRequest() {
    return this.http.get<LinkRequest>(`${this.base}/link-request`);
  }
}
