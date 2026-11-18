import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  Injector,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { requestCode, requestMessage, type ApiProblem } from '../../core/api-problem';
import { formatUsd, formatDate, parseAmountToCents } from '../../shared/amount';
import { normalizeWeightKg, weightKgHint } from '../../shared/weight';
import { Icon } from '../../shared/icon';
import { RatesApi } from './rates-api';
import type { CourierRate, FreightQuote, RateMeasurement } from './rate.model';
import { rateInput, measurementInput } from './rate-rules';
@Component({
  selector: 'app-rates-page',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './rates-page.html',
  styleUrl: './rates-page.scss',
})
export class RatesPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(RatesApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly current = signal<CourierRate | null>(null);
  readonly history = signal<CourierRate[]>([]);
  readonly currentLoading = signal(false);
  readonly historyLoading = signal(false);
  readonly currentReady = signal(false);
  readonly historyReady = signal(false);
  readonly noCurrent = signal(false);
  readonly currentError = signal('');
  readonly historyError = signal('');
  readonly notice = signal('');
  readonly formError = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly publishing = signal(false);
  readonly busy = signal(false);
  readonly uncertain = signal(false);
  readonly calculating = signal(false);
  readonly calculation = signal<FreightQuote | null>(null);
  readonly measured = signal<RateMeasurement | null>(null);
  readonly calculationError = signal('');
  readonly rateForm = this.fb.nonNullable.group({
    price: [''],
    min_lb: [1],
    volumetric_divisor: [166],
    valid_from: [''],
  });
  readonly measurements = this.fb.nonNullable.group({
    weight_kg: [''],
    length_mm: [100],
    width_mm: [100],
    height_mm: [100],
  });
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('publishDialog');
  readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('ratesHeading');
  readonly usd = formatUsd;
  readonly date = formatDate;
  readonly weightHint = weightKgHint;
  private currentRequest?: Subscription;
  private historyRequest?: Subscription;
  private quoteRequest?: Subscription;
  constructor() {
    this.refresh();
    const changes = this.measurements.valueChanges.subscribe(() => this.clearCalculation());
    this.destroyRef.onDestroy(() => {
      this.currentRequest?.unsubscribe();
      this.historyRequest?.unsubscribe();
      this.quoteRequest?.unsubscribe();
      changes.unsubscribe();
    });
  }
  get canOpenPublish() {
    return (
      this.auth.admin() &&
      !this.busy() &&
      this.currentReady() &&
      this.historyReady() &&
      !this.currentLoading() &&
      !this.historyLoading()
    );
  }
  get canPublish() {
    return (
      this.publishing() && this.canOpenPublish && !this.uncertain() && !!this.publicationInput()
    );
  }
  get canCalculate() {
    return !this.busy() && !this.calculating() && !!this.measurement();
  }
  get invalidStart() {
    const v = this.rateForm.controls.valid_from.value;
    return (
      !!v && !rateInput({ price_per_lb_cents: 1, min_lb: 1, volumetric_divisor: 1, valid_from: v })
    );
  }
  refresh() {
    if (this.busy()) return;
    this.clearCalculation();
    this.loadCurrent();
    this.loadHistory();
  }
  loadCurrent() {
    if (this.busy()) return;
    this.currentRequest?.unsubscribe();
    this.currentLoading.set(true);
    this.currentReady.set(false);
    this.currentError.set('');
    this.noCurrent.set(false);
    this.currentRequest = this.api.current().subscribe({
      next: (rate) => {
        this.current.set(rate);
        this.currentLoading.set(false);
        this.currentReady.set(true);
      },
      error: (error: unknown) => {
        this.currentLoading.set(false);
        if (requestCode(error) === 'no_rate') {
          this.current.set(null);
          this.noCurrent.set(true);
          this.currentReady.set(true);
        } else this.currentError.set(requestMessage(error));
      },
    });
  }
  loadHistory() {
    if (this.busy()) return;
    this.historyRequest?.unsubscribe();
    this.historyLoading.set(true);
    this.historyReady.set(false);
    this.historyError.set('');
    this.historyRequest = this.api.list().subscribe({
      next: (rates) => {
        this.history.set(rates);
        this.historyLoading.set(false);
        this.historyReady.set(true);
      },
      error: (error: unknown) => {
        this.historyLoading.set(false);
        this.historyError.set(requestMessage(error));
      },
    });
  }
  private publicationInput() {
    const v = this.rateForm.getRawValue();
    return rateInput({ ...v, price_per_lb_cents: parseAmountToCents(v.price) });
  }
  private measurement() {
    const v = this.measurements.getRawValue();
    return measurementInput({ ...v, weight_kg: normalizeWeightKg(v.weight_kg) });
  }
  startPublish() {
    if (!this.canOpenPublish || this.publishing()) return;
    this.rateForm.reset({ price: '', min_lb: 1, volumetric_divisor: 166, valid_from: '' });
    this.formError.set('');
    this.fieldErrors.set({});
    this.uncertain.set(false);
    this.publishing.set(true);
    this.dialog().nativeElement.showModal();
  }
  cancelPublish(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.dialog().nativeElement.close();
    this.publishing.set(false);
    this.rateForm.reset();
    this.formError.set('');
    this.fieldErrors.set({});
    if (!this.canOpenPublish) this.focusHeading();
  }
  publish() {
    const input = this.publicationInput();
    if (!input || !this.canPublish) return;
    this.busy.set(true);
    this.clearCalculation();
    this.formError.set('');
    this.fieldErrors.set({});
    this.notice.set('');
    this.api
      .create(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.cancelPublish();
          this.notice.set(
            'Nueva tarifa publicada. La vigencia y el historial se consultan de nuevo.',
          );
          this.refresh();
          this.focusHeading();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.formError.set(requestMessage(error));
          this.fieldErrors.set((error as { error?: ApiProblem } | null)?.error?.errors ?? {});
          const status =
            error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
          if (status === 0 || (status >= 200 && status < 300) || status >= 500) {
            this.uncertain.set(true);
            this.formError.set(
              `${requestMessage(error)} La tarifa puede haberse publicado. Cancela y revisa la vigencia y el historial antes de publicar otra versión.`,
            );
          }
          if (status === 409 || this.uncertain()) this.refresh();
        },
      });
  }
  calculate() {
    const input = this.measurement();
    if (!input || !this.canCalculate) return;
    this.quoteRequest?.unsubscribe();
    this.calculating.set(true);
    this.calculation.set(null);
    this.measured.set(null);
    this.calculationError.set('');
    this.quoteRequest = this.api.quote(input).subscribe({
      next: (quote) => {
        this.calculation.set(quote);
        this.measured.set(input);
        this.calculating.set(false);
        if (quote.rate_id !== this.current()?.id) {
          this.loadCurrent();
          this.loadHistory();
        }
      },
      error: (error: unknown) => {
        this.calculating.set(false);
        this.calculationError.set(requestMessage(error));
      },
    });
  }
  private clearCalculation() {
    this.quoteRequest?.unsubscribe();
    this.calculating.set(false);
    this.calculation.set(null);
    this.measured.set(null);
    this.calculationError.set('');
  }
  phase(rate: CourierRate) {
    if (this.currentReady() && this.current()?.id === rate.id) return 'Vigente';
    const now = Date.now();
    if (Date.parse(rate.valid_from) > now) return 'Programada';
    if (rate.valid_to && Date.parse(rate.valid_to) <= now) return 'Finalizada';
    return 'Vigencia por confirmar';
  }
  private focusHeading() {
    afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.injector });
  }
}
