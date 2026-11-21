import { LoadingIndicator } from '../../shared/loading-indicator';
import { RecordBrowser } from '../../shared/record-browser';
import {
  Component,
  Injector,
  afterNextRender,
  DestroyRef,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { requestMessage } from '../../core/api-problem';
import { Icon } from '../../shared/icon';
import { formatDate, formatUsd } from '../../shared/amount';
import { AirfreightApi } from './airfreight-api';
import type { FlightConsolidation, Manifest, Mawb, MawbInput } from './airfreight.model';
import { flightReference, limaDeparture, normalizeMawb } from './airfreight-rules';

@Component({
  selector: 'app-airfreight-page',
  imports: [LoadingIndicator, RecordBrowser, ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './airfreight-page.html',
  styleUrl: './airfreight-page.scss',
})
export class AirfreightPage {
  readonly listRevision = signal(0);
  readonly lotStatuses = [
    { value: 'open', label: 'Abierto' },
    { value: 'closed', label: 'Cerrado' },
  ];

  backToList() {
    if (this.busy() || this.loading()) return;
    this.mawb.set(null);
    this.listRevision.update((v) => v + 1);
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }
  selectRecord(id: string) {
    if (this.busy() || this.loading()) return;
    this.reference.setValue(id);
    this.open();
  }
  readonly auth = inject(AuthService);
  private readonly api = inject(AirfreightApi);
  private readonly injector = inject(Injector);
  readonly flightHeading = viewChild<ElementRef<HTMLHeadingElement>>('flightHeading');
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly mawb = signal<Mawb | null>(null);
  readonly candidate = signal<FlightConsolidation | null>(null);
  readonly manifest = signal<Manifest | null>(null);
  readonly loading = signal(false);
  readonly manifestLoading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly manifestError = signal('');
  readonly createError = signal('');
  readonly success = signal('');
  readonly confirming = signal(false);
  readonly date = formatDate;
  readonly money = formatUsd;
  readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  readonly dispatchDialog = viewChild.required<ElementRef<HTMLDialogElement>>('dispatchDialog');
  readonly reference = this.fb.nonNullable.control('');
  readonly consolidationReference = this.fb.nonNullable.control('');
  readonly lookupForm = this.fb.nonNullable.group({ reference: this.reference });
  readonly consolidationLookupForm = this.fb.nonNullable.group({
    reference: this.consolidationReference,
  });
  readonly form = this.fb.nonNullable.group({
    number: ['', Validators.required],
    flight_number: ['', Validators.required],
    origin: ['', Validators.required],
    destination: ['', Validators.required],
    departure_at: ['', Validators.required],
  });
  readonly creationFields = [
    {
      key: 'number',
      label: 'Número MAWB',
      placeholder: '001-12345675',
      full: true,
      hint: 'Prefijo de 3 dígitos y serie de 8 con dígito de control IATA.',
    },
    { key: 'flight_number', label: 'Número de vuelo', placeholder: 'LA2471', full: true, hint: '' },
    {
      key: 'origin',
      label: 'Aeropuerto de origen',
      placeholder: 'MIA',
      full: false,
      hint: 'Código IATA de 3 letras.',
    },
    {
      key: 'destination',
      label: 'Aeropuerto de destino',
      placeholder: 'LIM',
      full: false,
      hint: '',
    },
    {
      key: 'departure_at',
      label: 'Salida prevista · hora de Perú',
      placeholder: '',
      full: true,
      hint: 'Hora de Perú (UTC−05:00), aunque tu equipo use otra zona horaria.',
    },
  ] as const;
  fieldError(key: keyof MawbInput): string {
    const control = this.form.controls[key];
    if (!control.dirty && !control.touched) return '';
    const value = control.value.trim();
    if (!value) return 'Este dato es obligatorio.';
    if (key === 'number' && !normalizeMawb(value))
      return 'Comprueba el formato y el dígito de control IATA de la MAWB.';
    if (
      key === 'flight_number' &&
      !/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(value.replaceAll(' ', '').toUpperCase())
    )
      return 'Usa el código de aerolínea y número de vuelo, por ejemplo LA2471.';
    if ((key === 'origin' || key === 'destination') && !/^[A-Z]{3}$/i.test(value))
      return 'Introduce un código IATA de 3 letras.';
    if (
      key === 'destination' &&
      value.toUpperCase() === this.form.controls.origin.value.trim().toUpperCase()
    )
      return 'El destino debe ser distinto del aeropuerto de origen.';
    if (key === 'departure_at' && !limaDeparture(value))
      return 'Introduce una fecha y hora válidas en hora de Perú.';
    return '';
  }
  private detailRequest?: Subscription;
  private manifestRequest?: Subscription;
  constructor() {
    const mawbId = this.route.snapshot.queryParamMap.get('mawb_id');
    const consolidationId = this.route.snapshot.queryParamMap.get('consolidation_id');
    if (mawbId) {
      this.reference.setValue(mawbId);
      this.open();
    }
    if (consolidationId) {
      this.consolidationReference.setValue(consolidationId);
      this.inspect();
    }
    this.destroyRef.onDestroy(() => {
      this.detailRequest?.unsubscribe();
      this.manifestRequest?.unsubscribe();
    });
  }
  get payload(): MawbInput | null {
    const value = this.form.getRawValue();
    const number = normalizeMawb(value.number);
    const departure_at = limaDeparture(value.departure_at);
    const flight_number = value.flight_number.trim().replaceAll(' ', '').toUpperCase();
    const origin = value.origin.trim().toUpperCase();
    const destination = value.destination.trim().toUpperCase();
    return number &&
      departure_at &&
      /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(flight_number) &&
      /^[A-Z]{3}$/.test(origin) &&
      /^[A-Z]{3}$/.test(destination) &&
      origin !== destination
      ? { number, departure_at, flight_number, origin, destination }
      : null;
  }
  get canDispatch() {
    return (
      this.auth.manager() &&
      this.mawb()?.status === 'open' &&
      !!this.mawb()?.consolidation_ids?.length &&
      !this.busy() &&
      !this.loading()
    );
  }
  get canAttach() {
    return (
      this.auth.manager() &&
      this.mawb()?.status === 'open' &&
      this.candidate()?.status === 'closed' &&
      !!this.manifest() &&
      !this.manifest()?.mawb &&
      !this.mawb()?.consolidation_ids?.includes(this.candidate()!.id) &&
      !this.busy() &&
      !this.loading() &&
      !this.manifestLoading()
    );
  }
  open() {
    if (!this.auth.manager() || this.busy()) return;
    const id = flightReference(this.reference.value, 'mawb', location.origin);
    if (!id) {
      this.error.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.detailRequest?.unsubscribe();
    if (this.mawb()?.id !== id) this.mawb.set(null);
    this.error.set('');
    this.success.set('');
    this.loading.set(true);
    this.detailRequest = this.api.get(id).subscribe({
      next: (mawb) => {
        this.loading.set(false);
        this.apply(mawb);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(requestMessage(error));
      },
    });
  }
  startCreate() {
    if (!this.auth.manager() || this.busy() || this.loading()) return;
    this.form.reset();
    this.createError.set('');
    this.createDialog().nativeElement.showModal();
  }
  cancelCreate(event?: Event) {
    event?.preventDefault();
    if (!this.busy()) {
      this.createDialog().nativeElement.close();
      this.form.reset();
      this.createError.set('');
    }
  }
  create() {
    const payload = this.payload;
    if (!this.auth.manager() || !payload || this.busy()) return;
    this.busy.set(true);
    this.createError.set('');
    this.success.set('');
    this.api
      .create(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mawb) => {
          this.busy.set(false);
          this.apply(mawb);
          this.cancelCreate();
          this.success.set('MAWB creada. Ya puedes asociar consolidados cerrados.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.createError.set(requestMessage(error));
        },
      });
  }
  inspect(id?: string) {
    if (!this.auth.manager() || this.busy()) return;
    const reference =
      id ?? flightReference(this.consolidationReference.value, 'consolidation', location.origin);
    if (!reference) {
      this.manifestError.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.manifestRequest?.unsubscribe();
    this.candidate.set(null);
    this.manifest.set(null);
    this.manifestError.set('');
    this.manifestLoading.set(true);
    this.manifestRequest = this.api
      .consolidation(reference)
      .pipe(
        switchMap((candidate) => {
          this.candidate.set(candidate);
          this.consolidationReference.setValue(candidate.id);
          if (candidate.status !== 'closed') return of(null);
          return this.api.manifest(candidate.id);
        }),
      )
      .subscribe({
        next: (manifest) => {
          this.manifest.set(manifest);
          this.manifestLoading.set(false);
        },
        error: (error: unknown) => {
          this.manifestLoading.set(false);
          this.manifestError.set(requestMessage(error));
        },
      });
  }
  attach() {
    const mawb = this.mawb();
    const candidate = this.candidate();
    if (!mawb || !candidate || !this.canAttach) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .attach(mawb.id, candidate.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.apply(updated);
          this.success.set(`${candidate.code} asociado a ${updated.number}.`);
          this.inspect(candidate.id);
        },
        error: (error: unknown) => this.mutationError(error, mawb.id),
      });
  }
  prepareDispatch() {
    if (!this.canDispatch) return;
    this.error.set('');
    this.confirming.set(true);
    this.dispatchDialog().nativeElement.showModal();
  }
  cancelDispatch(event?: Event) {
    event?.preventDefault();
    if (!this.busy()) {
      this.dispatchDialog().nativeElement.close();
      this.confirming.set(false);
      if (this.mawb()?.status === 'closed') {
        afterNextRender(() => this.flightHeading()?.nativeElement.focus(), {
          injector: this.injector,
        });
      }
    }
  }
  dispatch() {
    const mawb = this.mawb();
    if (!mawb || !this.confirming() || !this.canDispatch) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .dispatch(mawb.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.apply(result.mawb);
          this.cancelDispatch();
          this.success.set(
            `Salida registrada. ${result.packages_in_transit} paquetes en tránsito.`,
          );
        },
        error: (error: unknown) => this.mutationError(error, mawb.id),
      });
  }
  private mutationError(error: unknown, id: string) {
    this.error.set(requestMessage(error));
    this.success.set('');
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
      this.detailRequest?.unsubscribe();
      this.detailRequest = this.api.get(id).subscribe({
        next: (mawb) => {
          this.apply(mawb);
          this.busy.set(false);
          const candidate = this.candidate();
          if (candidate) this.inspect(candidate.id);
        },
        error: () => {
          this.mawb.set(null);
          this.busy.set(false);
          this.error.update(
            (message) =>
              `${message} No se pudo actualizar la MAWB. Vuelve a abrirla antes de continuar.`,
          );
        },
      });
    } else this.busy.set(false);
  }
  downloadCsv() {
    const candidate = this.candidate();
    if (!candidate || !this.manifest() || this.busy() || this.manifestLoading()) return;
    this.busy.set(true);
    this.manifestError.set('');
    this.api
      .manifestCsv(candidate.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.busy.set(false);
          if (!blob.type.includes('csv')) {
            this.manifestError.set('No se recibió un manifiesto CSV válido.');
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `manifest-${candidate.code}.csv`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.manifestError.set(requestMessage(error));
        },
      });
  }
  async copyLink() {
    const mawb = this.mawb();
    if (!mawb) return;
    try {
      const url = new URL('/internal/airfreight', location.origin);
      url.searchParams.set('mawb_id', mawb.id);
      await navigator.clipboard.writeText(url.href);
      if (this.mawb()?.id === mawb.id) this.success.set('Enlace de la MAWB copiado.');
    } catch {
      this.error.set('No se pudo copiar el enlace. Puedes copiarlo desde la barra de direcciones.');
    }
  }
  private apply(mawb: Mawb) {
    this.mawb.set(mawb);
    this.listRevision.update((v) => v + 1);
    this.reference.setValue(mawb.id);
    void this.router.navigate([], {
      queryParams: { mawb_id: mawb.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
