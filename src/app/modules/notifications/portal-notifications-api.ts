import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { RuntimeConfig } from '../../core/runtime-config';
import type { PortalNotification } from './notification.model';

@Injectable({ providedIn: 'root' })
export class PortalNotificationsApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  list() {
    return this.http
      .get<{ notifications: PortalNotification[] }>(
        `${this.config.value.apiBaseUrl}/portal/notifications`,
      )
      .pipe(map((r) => r.notifications));
  }
}
