import { LoadingIndicator } from '../../shared/loading-indicator';
import { Icon } from '../../shared/icon';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { requestCode, requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';
import { PortalNotificationsApi } from './portal-notifications-api';
import { notificationTarget, type PortalNotification } from './notification.model';

@Component({
  selector: 'app-portal-notifications-page',
  imports: [LoadingIndicator, Icon, RouterLink],
  templateUrl: './portal-notifications-page.html',
  styleUrl: './portal-notifications-page.scss',
})
export class PortalNotificationsPage {
  private readonly api = inject(PortalNotificationsApi);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  readonly previewDialog = viewChild.required<ElementRef<HTMLDialogElement>>('previewDialog');
  openNotice(notice: PortalNotification) {
    this.selected.set(notice);
    this.previewDialog().nativeElement.showModal();
  }
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
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.notifications.set(items);
          this.selected.set(
            items.find((item) => item.id === this.selected()?.id) ?? items[0] ?? null,
          );
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
