import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { requestCode, requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';
import { PortalNotificationsApi } from './portal-notifications-api';
import { notificationTarget, type PortalNotification } from './notification.model';

@Component({
  selector: 'app-portal-notifications-page',
  imports: [RouterLink],
  templateUrl: './portal-notifications-page.html',
  styleUrl: './portal-notifications-page.scss',
})
export class PortalNotificationsPage {
  private readonly api = inject(PortalNotificationsApi);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  readonly notifications = signal<PortalNotification[]>([]);
  readonly selected = signal<PortalNotification | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly filter = signal('');
  readonly filtered = computed(() =>
    this.notifications().filter((n) =>
      `${n.subject} ${n.body}`.toLowerCase().includes(this.filter().trim().toLowerCase()),
    ),
  );
  readonly target = computed(() =>
    notificationTarget(this.selected()?.link, this.document.location.origin),
  );
  readonly date = formatDate;
  constructor() {
    this.reload();
  }
  reload() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.selected.set(null);
    this.notifications.set([]);
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.notifications.set(items);
          this.selected.set(items[0] ?? null);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
          else this.error.set(requestMessage(error));
        },
      });
  }
}
