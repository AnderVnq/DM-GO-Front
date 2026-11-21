import { LoadingIndicator } from '../../shared/loading-indicator';
import { RecordBrowser } from '../../shared/record-browser';
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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { requestMessage } from '../../core/api-problem';
import { formatDate } from '../../shared/amount';
import { Icon } from '../../shared/icon';
import { WarehousesApi, type Warehouse } from '../warehouses';
import { ReceptionsApi } from './receptions-api';
import type {
  Reception,
  ReceptionMawb,
  ReceptionScan,
  ScanInput,
  ScanResult,
} from './reception.model';
import {
  normalizeScanCode,
  receptionReference,
  validPieces,
  validScanCode,
} from './reception-rules';

@Component({
  selector: 'app-receptions-page',
  imports: [LoadingIndicator, RecordBrowser, ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './receptions-page.html',
  styleUrl: './receptions-page.scss',
})
export class ReceptionsPage {
  readonly listRevision = signal(0);
  readonly lotStatuses = [
    { value: 'open', label: 'Abierto' },
    { value: 'closed', label: 'Cerrado' },
  ];

  readonly choosingMawb = signal(false);
  backToList() {
    if (this.busy() || this.loading()) return;
    this.session.set(null);
    this.listRevision.update((v) => v + 1);
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }
  selectRecord(id: string) {
    if (this.busy() || this.loading()) return;
    this.lookup.controls.reference.setValue(id);
    this.openSession();
  }
  selectMawb(id: string) {
    if (this.busy() || this.mawbLoading()) return;
    this.newForm.controls.mawb_reference.setValue(id);
    this.checkMawb();
  }
  readonly auth = inject(AuthService);
  private readonly api = inject(ReceptionsApi);
  private readonly catalog = inject(WarehousesApi);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly session = signal<Reception | null>(null);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly checkedMawb = signal<ReceptionMawb | null>(null);
  readonly loading = signal(false);
  readonly mawbLoading = signal(false);
  readonly catalogLoading = signal(false);
  readonly busy = signal(false);
  readonly stale = signal(false);
  readonly uncertainScan = signal(false);
  readonly uncertainOpen = signal<string[]>([]);
  readonly confirming = signal(false);
  readonly correcting = signal(false);
  readonly error = signal('');
  readonly createError = signal('');
  readonly catalogError = signal('');
  readonly correctionError = signal('');
  readonly notice = signal('');
  readonly lastScan = signal<ScanResult | null>(null);
  readonly date = formatDate;
  readonly createDialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  readonly correctionDialog = viewChild.required<ElementRef<HTMLDialogElement>>('correctionDialog');
  readonly closeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('closeDialog');
  readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('receptionHeading');
  readonly scanner = viewChild<ElementRef<HTMLInputElement>>('scanner');
  readonly lookup = this.fb.nonNullable.group({ reference: [''] });
  readonly newForm = this.fb.nonNullable.group({ mawb_reference: [''], warehouse_code: [''] });
  readonly scanForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
    pieces: [1],
    note: [''],
  });
  readonly correction = this.fb.nonNullable.group({ pieces: [1], note: [''] });
  readonly editingScan = signal<ReceptionScan | null>(null);
  private editingSessionId = '';
  private closingSessionId = '';
  private detailRequest?: Subscription;
  private mawbRequest?: Subscription;
  constructor() {
    this.loadWarehouses();
    const referenceChanges = this.newForm.controls.mawb_reference.valueChanges.subscribe(() => {
      this.mawbRequest?.unsubscribe();
      this.checkedMawb.set(null);
      this.mawbLoading.set(false);
      this.createError.set('');
    });
    this.destroyRef.onDestroy(() => {
      this.detailRequest?.unsubscribe();
      this.mawbRequest?.unsubscribe();
      referenceChanges.unsubscribe();
    });
    const id = this.route.snapshot.queryParamMap.get('reception_id');
    const mawbId = this.route.snapshot.queryParamMap.get('mawb_id');
    if (id) {
      this.lookup.controls.reference.setValue(id);
      this.openSession();
    } else if (mawbId) afterNextRender(() => this.startNew());
  }
  get canOperate() {
    return (
      this.auth.manager() &&
      this.session()?.status === 'open' &&
      !this.busy() &&
      !this.loading() &&
      !this.stale() &&
      !this.uncertainScan()
    );
  }
  get validScanCodeHint() {
    return validScanCode(this.scanForm.controls.code.value);
  }
  get validScan() {
    const value = this.scanForm.getRawValue();
    return validScanCode(value.code) && validPieces(value.pieces, false);
  }
  get canCreate() {
    return (
      this.auth.manager() &&
      this.checkedMawb()?.status === 'closed' &&
      !this.uncertainOpen().includes(this.checkedMawb()!.id) &&
      this.warehouses().some((w) => w.code === this.newForm.controls.warehouse_code.value) &&
      !this.busy() &&
      !this.mawbLoading() &&
      !this.catalogLoading()
    );
  }
  get canCorrect() {
    const value = this.correction.getRawValue();
    const saved = this.editingScan();
    return (
      this.canOperate &&
      this.correcting() &&
      this.session()?.id === this.editingSessionId &&
      !!saved &&
      validPieces(value.pieces, true) &&
      (value.pieces !== saved.pieces || value.note.trim() !== (saved.note ?? '').trim())
    );
  }
  loadWarehouses() {
    if (!this.auth.manager() || this.catalogLoading() || this.busy()) return;
    this.catalogLoading.set(true);
    this.catalogError.set('');
    this.catalog
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          const warehouses = items.filter((w) => w.active && w.country === 'PE');
          this.warehouses.set(warehouses);
          this.catalogLoading.set(false);
          if (!warehouses.some((w) => w.code === this.newForm.controls.warehouse_code.value))
            this.newForm.controls.warehouse_code.setValue(warehouses[0]?.code ?? '');
        },
        error: (error: unknown) => {
          this.catalogLoading.set(false);
          this.catalogError.set(requestMessage(error));
        },
      });
  }
  startNew() {
    if (!this.auth.manager() || this.busy() || this.loading()) return;
    this.newForm.reset({
      mawb_reference: this.route.snapshot.queryParamMap.get('mawb_id') ?? '',
      warehouse_code: this.warehouses()[0]?.code ?? '',
    });
    this.checkedMawb.set(null);
    this.createError.set('');
    this.choosingMawb.set(true);
    this.createDialog().nativeElement.showModal();
    if (this.newForm.controls.mawb_reference.value) this.checkMawb();
  }
  cancelNew(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.mawbRequest?.unsubscribe();
    this.mawbLoading.set(false);
    this.checkedMawb.set(null);
    this.choosingMawb.set(false);
    this.createDialog().nativeElement.close();
    this.newForm.reset();
    this.createError.set('');
  }
  checkMawb() {
    if (!this.auth.manager() || this.busy()) return;
    const id = receptionReference(
      this.newForm.controls.mawb_reference.value,
      'mawb',
      location.origin,
    );
    if (!id) {
      this.createError.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.mawbRequest?.unsubscribe();
    this.checkedMawb.set(null);
    this.createError.set('');
    this.mawbLoading.set(true);
    this.mawbRequest = this.api.mawb(id).subscribe({
      next: (mawb) => {
        this.checkedMawb.set(mawb);
        this.mawbLoading.set(false);
      },
      error: (error: unknown) => {
        this.mawbLoading.set(false);
        this.createError.set(requestMessage(error));
      },
    });
  }
  create() {
    const mawb = this.checkedMawb();
    if (!mawb || !this.canCreate) return;
    this.busy.set(true);
    this.createError.set('');
    this.api
      .open(mawb.id, this.newForm.controls.warehouse_code.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.detailRequest?.unsubscribe();
          this.busy.set(false);
          this.apply(session);
          this.cancelNew();
          this.notice.set('Recepción abierta. Puedes comenzar a escanear guías o WR.');
          this.focusWorkspace();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const status =
            error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
          if (status === 0 || (status >= 200 && status < 300) || status >= 500) {
            this.uncertainOpen.update((ids) => [...ids, mawb.id]);
            this.createError.set(
              `${requestMessage(error)} La sesión puede haberse creado. No vuelvas a abrirla: consulta al responsable de operaciones para obtener su referencia y retómala desde «Abrir recepción».`,
            );
          } else this.createError.set(requestMessage(error));
        },
      });
  }
  openSession() {
    if (!this.auth.manager() || this.busy()) return;
    const id = receptionReference(
      this.lookup.controls.reference.value,
      'reception',
      location.origin,
    );
    if (!id) {
      this.error.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.detailRequest?.unsubscribe();
    this.session.set(null);
    this.notice.set('');
    this.lastScan.set(null);
    this.uncertainScan.set(false);
    this.read(id, false, true);
  }
  reload() {
    const session = this.session();
    if (session && !this.busy() && !this.loading()) this.read(session.id, false, false);
  }
  private read(id: string, preserveError: boolean, focus: boolean) {
    this.detailRequest?.unsubscribe();
    this.loading.set(true);
    if (!preserveError) this.error.set('');
    this.detailRequest = this.api.get(id).subscribe({
      next: (session) => {
        this.apply(session);
        this.loading.set(false);
        if (focus) this.focusWorkspace();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.stale.set(true);
        this.error.set(`${requestMessage(error)} Actualiza la recepción antes de seguir operando.`);
        if (focus) this.focusWorkspace();
      },
    });
  }
  private apply(session: Reception) {
    if (this.session()?.id !== session.id) {
      this.scanForm.reset({ code: '', pieces: 1, note: '' });
      this.lastScan.set(null);
      this.uncertainScan.set(false);
    }
    this.session.set(session);
    this.listRevision.update((v) => v + 1);
    this.stale.set(false);
    this.lookup.controls.reference.setValue(session.id);
    if (session.status === 'closed') this.uncertainScan.set(false);
    void this.router.navigate([], {
      queryParams: { reception_id: session.id, mawb_id: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  scan() {
    const session = this.session();
    const value = this.scanForm.getRawValue();
    if (!session || !this.canOperate || !this.validScan) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.lastScan.set(null);
    this.api
      .scan(session.id, {
        code: normalizeScanCode(value.code),
        pieces: value.pieces,
        note: value.note.trim(),
        replace: false,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.lastScan.set(result);
          this.scanForm.reset({ code: '', pieces: 1, note: '' });
          this.refreshAfterWrite(session.id);
        },
        error: (error: unknown) => this.writeError(error, session.id, true),
      });
  }
  openCorrection(scan: ReceptionScan) {
    if (!this.canOperate) return;
    this.editingSessionId = this.session()!.id;
    this.editingScan.set({ ...scan });
    this.correction.reset({ pieces: scan.pieces, note: scan.note ?? '' });
    this.correctionError.set('');
    this.correcting.set(true);
    this.correctionDialog().nativeElement.showModal();
  }
  cancelCorrection(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.correctionDialog().nativeElement.close();
    this.correcting.set(false);
    this.editingScan.set(null);
    this.editingSessionId = '';
    this.correction.reset();
    this.correctionError.set('');
    if (!this.canOperate) this.focusWorkspace();
  }
  saveCorrection() {
    const scan = this.editingScan();
    const session = this.session();
    if (!scan || !session || !this.canCorrect) return;
    const value = this.correction.getRawValue();
    const input: ScanInput = {
      code: scan.code,
      pieces: value.pieces,
      note: value.note.trim(),
      replace: true,
    };
    this.busy.set(true);
    this.correctionError.set('');
    this.notice.set('');
    this.api
      .scan(session.id, input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.stale.set(true);
          this.cancelCorrection();
          this.notice.set('Corrección guardada.');
          this.refreshAfterWrite(session.id);
        },
        error: (error: unknown) => this.writeError(error, session.id, true),
      });
  }
  private refreshAfterWrite(id: string) {
    this.busy.set(false);
    this.stale.set(true);
    this.read(id, false, true);
  }
  private writeError(error: unknown, id: string, scanWrite: boolean) {
    this.busy.set(false);
    const message = requestMessage(error);
    this.error.set(message);
    if (this.correcting()) this.correctionError.set(message);
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    if (status === 409 || status === 0 || (status >= 200 && status < 300) || status >= 500) {
      if (scanWrite && status !== 409) this.uncertainScan.set(true);
      this.stale.set(true);
      this.read(id, true, false);
    }
  }
  acknowledgeScans() {
    if (this.stale() || this.loading() || this.busy()) return;
    this.uncertainScan.set(false);
    this.scanForm.reset({ code: '', pieces: 1, note: '' });
    this.error.set('');
    this.focusWorkspace();
  }
  prepareClose() {
    if (!this.canOperate) return;
    this.closingSessionId = this.session()!.id;
    this.error.set('');
    this.confirming.set(true);
    this.closeDialog().nativeElement.showModal();
  }
  cancelClose(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.closeDialog().nativeElement.close();
    this.confirming.set(false);
    this.closingSessionId = '';
    if (this.session()?.status === 'closed' || this.stale()) this.focusWorkspace();
  }
  closeReception() {
    const session = this.session();
    if (!session || !this.canOperate || !this.confirming() || session.id !== this.closingSessionId)
      return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .close(session.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (closed) => {
          this.apply(closed);
          this.busy.set(false);
          this.lastScan.set(null);
          this.cancelClose();
          this.notice.set('Recepción cerrada. Consulta el cuadre confirmado por el servidor.');
          this.focusWorkspace();
        },
        error: (error: unknown) => this.writeError(error, session.id, false),
      });
  }
  private focusWorkspace() {
    afterNextRender(
      () => {
        const element = this.canOperate
          ? this.scanner()?.nativeElement
          : this.heading()?.nativeElement;
        element?.focus();
      },
      { injector: this.injector },
    );
  }
  async copyLink() {
    const session = this.session();
    if (!session) return;
    try {
      const url = new URL('/internal/receptions', location.origin);
      url.searchParams.set('reception_id', session.id);
      await navigator.clipboard.writeText(url.href);
      if (this.session()?.id === session.id) this.notice.set('Enlace de la recepción copiado.');
    } catch {
      this.error.set('No se pudo copiar el enlace. Puedes copiarlo desde la barra de direcciones.');
    }
  }
}
