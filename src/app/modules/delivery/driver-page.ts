import {
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
  afterNextRender,
  Injector,
  type ElementRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents-api';
import { requestMessage } from '../../core/api-problem';
import { ThemeToggle } from '../../shared/theme-toggle';
import { Icon } from '../../shared/icon';
import { formatDate } from '../../shared/amount';
import { DriverApi, type DriverIdentity, type DriverResolution } from './driver-api';
import {
  type DeliveryRoute,
  type RouteStop,
  routeStatuses,
  packageResults,
} from './delivery-route.model';
import { todayInLima, validRouteDate, routeDayLabel } from './delivery-route-rules';
import { evidenceError, validPoint, validReceiver, type DeliveryPoint } from './driver-rules';
interface EvidenceItem {
  key: number;
  file: File;
  id?: string;
  uploading?: boolean;
}
@Component({
  selector: 'app-driver-page',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle, Icon],
  templateUrl: './driver-page.html',
  styleUrl: './driver-page.scss',
})
export class DriverPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(DriverApi);
  private readonly documents = inject(DocumentsApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly activated = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly identity = signal<DriverIdentity | null>(null);
  readonly routes = signal<DeliveryRoute[]>([]);
  readonly selectedRouteId = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly stale = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly mode = signal<'deliver' | 'fail' | null>(null);
  readonly modalStop = signal<RouteStop | null>(null);
  readonly selectedIds = signal<string[]>([]);
  readonly modalError = signal('');
  readonly changedNotice = signal('');
  readonly files = signal<EvidenceItem[]>([]);
  readonly fileMessage = signal('');
  readonly point = signal<DeliveryPoint | null>(null);
  readonly accuracy = signal<number | null>(null);
  readonly geoLoading = signal(false);
  readonly geoError = signal('');
  readonly listForm = this.fb.nonNullable.group({ date: [todayInLima()] });
  readonly resolution = this.fb.nonNullable.group({
    receiver_name: [''],
    doc_type: ['dni'],
    doc_number: [''],
    agency_guide_number: [''],
    reason: [''],
  });
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('resolutionDialog');
  readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  readonly routeHeading = viewChild<ElementRef<HTMLHeadingElement>>('routeHeading');
  readonly date = formatDate;
  readonly day = routeDayLabel;
  readonly statuses = routeStatuses;
  readonly results = packageResults;
  private request?: Subscription;
  private modalRouteId = '';
  private fileSequence = 0;
  private geoSequence = 0;
  private alive = true;
  private loadedDate = '';
  constructor() {
    const date = this.activated.snapshot.queryParamMap.get('date');
    if (date && validRouteDate(date)) this.listForm.controls.date.setValue(date);
    this.selectedRouteId.set(this.activated.snapshot.queryParamMap.get('route_id') ?? '');
    this.load();
    this.destroyRef.onDestroy(() => {
      this.alive = false;
      this.geoSequence++;
      this.request?.unsubscribe();
    });
  }
  get selectedRoute() {
    return this.routes().find((r) => r.id === this.selectedRouteId()) ?? null;
  }
  get validDate() {
    return validRouteDate(this.listForm.controls.date.value);
  }
  get canSubmit() {
    const route = this.routes().find((r) => r.id === this.modalRouteId),
      stop = route?.stops.find((s) => s.id === this.modalStop()?.id),
      ids = this.selectedIds(),
      mode = this.mode(),
      v = this.resolution.getRawValue();
    if (
      !this.auth.driver() ||
      !mode ||
      !stop ||
      route?.status !== 'in_progress' ||
      this.busy() ||
      this.loading() ||
      this.stale() ||
      this.geoLoading() ||
      !ids.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => stop.packages.some((p) => p.package_id === id && p.result === 'pending'))
    )
      return false;
    if (this.files().length > 10 || this.files().some((item) => !!evidenceError(item.file)))
      return false;
    if (mode === 'fail') return !!v.reason.trim();
    return (
      validReceiver(v.receiver_name, v.doc_type, v.doc_number) &&
      this.files().length > 0 &&
      validPoint(this.point()) &&
      (stop.kind !== 'agency' || !!v.agency_guide_number.trim())
    );
  }
  load() {
    if (!this.auth.driver() || this.busy() || !this.validDate) return;
    const date = this.listForm.controls.date.value;
    this.request?.unsubscribe();
    this.loading.set(true);
    this.stale.set(true);
    this.error.set('');
    if (this.loadedDate && this.loadedDate !== date) {
      this.routes.set([]);
      this.selectedRouteId.set('');
    }
    this.request = this.api
      .register()
      .pipe(
        switchMap((identity) => {
          this.identity.set(identity);
          return this.api.routes(date);
        }),
      )
      .subscribe({
        next: (routes) => {
          this.routes.set(routes);
          this.loadedDate = date;
          this.loading.set(false);
          this.stale.set(false);
          this.syncModal();
          if (this.selectedRouteId() && !routes.some((r) => r.id === this.selectedRouteId()))
            this.selectedRouteId.set('');
          this.updateUrl();
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(
            `${requestMessage(error)} Actualiza tus rutas antes de registrar una entrega.`,
          );
        },
      });
  }
  showRoute(route: DeliveryRoute) {
    if (this.busy() || this.mode()) return;
    this.selectedRouteId.set(route.id);
    this.updateUrl();
    this.focusHeading();
  }
  private updateUrl() {
    void this.router.navigate([], {
      queryParams: {
        date: this.listForm.controls.date.value,
        route_id: this.selectedRouteId() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  pending(stop: RouteStop) {
    return stop.packages.filter((p) => p.result === 'pending').length;
  }
  openStop(route: DeliveryRoute, stop: RouteStop, mode: 'deliver' | 'fail') {
    const current = this.routes().find((r) => r.id === route.id),
      saved = current?.stops.find((s) => s.id === stop.id);
    if (
      !this.auth.driver() ||
      this.busy() ||
      this.loading() ||
      this.stale() ||
      this.mode() ||
      current?.status !== 'in_progress' ||
      !saved ||
      !this.pending(saved)
    )
      return;
    this.modalRouteId = current.id;
    this.modalStop.set(saved);
    this.selectedIds.set(
      saved.packages.filter((p) => p.result === 'pending').map((p) => p.package_id),
    );
    this.mode.set(mode);
    this.resolution.reset({
      receiver_name: '',
      doc_type: 'dni',
      doc_number: '',
      agency_guide_number: '',
      reason: '',
    });
    this.modalError.set('');
    this.changedNotice.set('');
    this.files.set([]);
    this.fileInput().nativeElement.value = '';
    this.fileMessage.set('');
    this.point.set(null);
    this.accuracy.set(null);
    this.geoError.set('');
    this.geoLoading.set(false);
    this.geoSequence++;
    this.dialog().nativeElement.showModal();
  }
  cancel(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.geoSequence++;
    this.geoLoading.set(false);
    this.dialog().nativeElement.close();
    this.mode.set(null);
    this.modalStop.set(null);
    this.selectedIds.set([]);
    this.modalRouteId = '';
    this.files.set([]);
    this.point.set(null);
    this.resolution.reset();
    this.modalError.set('');
    this.focusHeading();
  }
  togglePackage(id: string, event: Event) {
    if (this.busy() || this.stale() || this.loading()) return;
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedIds.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id),
    );
  }
  chooseFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    if (this.busy()) return;
    const incoming = Array.from(input.files ?? []);
    input.value = '';
    this.fileMessage.set('');
    if (this.files().length + incoming.length > 10) {
      this.fileMessage.set(
        'Puedes adjuntar hasta 10 fotos o videos. No se añadieron los archivos seleccionados.',
      );
      return;
    }
    const bad = incoming.find((file) => evidenceError(file));
    if (bad) {
      this.fileMessage.set(
        `${bad.name}: ${evidenceError(bad)} No se añadieron los archivos seleccionados.`,
      );
      return;
    }
    this.files.update((items) => [
      ...items,
      ...incoming.map((file) => ({ key: ++this.fileSequence, file })),
    ]);
  }
  removeFile(key: number) {
    if (!this.busy()) this.files.update((items) => items.filter((item) => item.key !== key));
  }
  captureLocation() {
    if (this.busy() || this.geoLoading() || !this.mode()) return;
    this.geoError.set('');
    if (!navigator.geolocation) {
      this.geoError.set('Este navegador no ofrece ubicación. Usa un dispositivo compatible.');
      return;
    }
    const request = ++this.geoSequence;
    this.geoLoading.set(true);
    this.point.set(null);
    this.accuracy.set(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!this.alive || request !== this.geoSequence) return;
        this.geoLoading.set(false);
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        if (!validPoint(point)) {
          this.geoError.set('No se obtuvo una ubicación válida. Inténtalo de nuevo.');
          return;
        }
        this.point.set(point);
        this.accuracy.set(position.coords.accuracy);
      },
      (error) => {
        if (!this.alive || request !== this.geoSequence) return;
        this.geoLoading.set(false);
        this.geoError.set(
          error.code === 1
            ? 'Permite el acceso a la ubicación en tu navegador y vuelve a intentarlo.'
            : error.code === 3
              ? 'La ubicación tardó demasiado. Acércate a una zona con señal y reintenta.'
              : 'No se pudo obtener la ubicación. Verifica la señal y vuelve a intentarlo.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  async resolve() {
    const mode = this.mode(),
      stop = this.modalStop();
    if (!mode || !stop || !this.canSubmit) return;
    const value = this.resolution.getRawValue(),
      ids = [...this.selectedIds()],
      point = this.point();
    this.busy.set(true);
    this.modalError.set('');
    this.notice.set('');
    let posting = false;
    try {
      for (const item of this.files()) {
        if (item.id) continue;
        this.files.update((items) =>
          items.map((saved) => (saved.key === item.key ? { ...saved, uploading: true } : saved)),
        );
        const upload = this.documents.uploadDirect(item.file);
        const document = await firstValueFrom(upload.pipe(takeUntilDestroyed(this.destroyRef)));
        if (!this.alive) return;
        if (!document.id) throw new Error('No se recibió la referencia de la evidencia.');
        this.files.update((items) =>
          items.map((saved) =>
            saved.key === item.key ? { ...saved, id: document.id, uploading: false } : saved,
          ),
        );
      }
      const input: DriverResolution = {
        package_ids: ids,
        evidence_document_ids: [...new Set(this.files().map((item) => item.id!))],
        ...(point ? { latitude: point.latitude, longitude: point.longitude } : {}),
      };
      if (mode === 'deliver') {
        input.receiver = {
          name: value.receiver_name.trim().replace(/\s+/g, ' '),
          doc_type: value.doc_type,
          doc_number: value.doc_number.trim().toUpperCase(),
        };
        if (stop.kind === 'agency') input.agency_guide_number = value.agency_guide_number.trim();
      } else input.reason = value.reason.trim();
      posting = true;
      const updated = await firstValueFrom(
        this.api.resolve(stop.id, mode, input).pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (!this.alive) return;
      this.routes.update((routes) =>
        routes.map((route) =>
          route.id === this.modalRouteId
            ? { ...route, stops: route.stops.map((s) => (s.id === updated.id ? updated : s)) }
            : route,
        ),
      );
      this.busy.set(false);
      this.cancel();
      this.notice.set(
        mode === 'deliver'
          ? `Entrega registrada para ${ids.length} ${ids.length === 1 ? 'paquete' : 'paquetes'}.`
          : `Intento fallido registrado para ${ids.length} ${ids.length === 1 ? 'paquete' : 'paquetes'}.`,
      );
      this.load();
    } catch (error: unknown) {
      if (!this.alive) return;
      this.busy.set(false);
      this.files.update((items) => items.map((item) => ({ ...item, uploading: false })));
      this.modalError.set(requestMessage(error));
      if (posting && this.needsRefresh(error)) this.load();
    }
  }
  private needsRefresh(error: unknown) {
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    return (
      status === 0 ||
      status === 409 ||
      (status >= 200 && status < 300) ||
      status >= 500 ||
      status === 404
    );
  }
  private syncModal() {
    if (!this.mode()) return;
    const stop = this.routes()
      .find((r) => r.id === this.modalRouteId)
      ?.stops.find((s) => s.id === this.modalStop()?.id);
    const previous = this.selectedIds();
    const remaining = previous.filter((id) =>
      stop?.packages.some((p) => p.package_id === id && p.result === 'pending'),
    );
    this.modalStop.set(stop ?? null);
    this.selectedIds.set(remaining);
    this.changedNotice.set(
      previous.length !== remaining.length
        ? 'Se retiraron de la selección paquetes ya resueltos o que ya no están disponibles. Revisa los pendientes antes de confirmar.'
        : 'Las rutas se actualizaron. Revisa los paquetes antes de confirmar.',
    );
  }
  private focusHeading() {
    afterNextRender(() => this.routeHeading()?.nativeElement.focus(), { injector: this.injector });
  }
}
