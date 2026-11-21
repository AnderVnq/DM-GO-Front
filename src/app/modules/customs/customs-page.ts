import { RecordDialog } from '../../shared/record-dialog';
import { DebouncedInput } from '../../shared/debounced-input';
import { CodeSearch } from '../../shared/code-search';
import { LoadingIndicator } from '../../shared/loading-indicator';
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
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { DocumentsApi } from '../../core/documents-api';
import { requestMessage, type ApiProblem } from '../../core/api-problem';
import { PdfPreviewService } from '../../shared/pdf-preview.service';
import { fileError } from '../../shared/download';
import { formatDate } from '../../shared/amount';
import { Icon } from '../../shared/icon';
import { CustomsApi } from './customs-api';
import {
  customsStatuses,
  importGroups,
  type CustomsLine,
  type CustomsImportResult,
  type DocumentKind,
} from './customs.model';
import {
  canRelease,
  customsMoney,
  customsReference,
  reportFileError,
  validManifest,
} from './customs-rules';
@Component({
  selector: 'app-customs-page',
  imports: [RecordDialog, DebouncedInput, CodeSearch, LoadingIndicator, ReactiveFormsModule, Icon],
  templateUrl: './customs-page.html',
  styleUrl: './customs-page.scss',
})
export class CustomsPage {
  closeDetail() {
    if (this.busy() || this.attaching() || this.releasing() || this.importing()) return;
    this.detailRequest?.unsubscribe();
    this.detailLoading.set(false);
    this.selected.set(null);
    this.lastDetailId = '';
    void this.router.navigate([], {
      queryParams: { line_id: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  readonly auth = inject(AuthService);
  private readonly api = inject(CustomsApi);
  private readonly documents = inject(DocumentsApi);
  private readonly preview = inject(PdfPreviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly fb = inject(FormBuilder);
  readonly lines = signal<CustomsLine[]>([]);
  readonly selected = signal<CustomsLine | null>(null);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly busy = signal(false);
  readonly stale = signal(false);
  readonly listError = signal('');
  readonly error = signal('');
  readonly notice = signal('');
  readonly modalError = signal('');
  readonly rowErrors = signal<[string, string][]>([]);
  readonly importing = signal(false);
  readonly attaching = signal(false);
  readonly releasing = signal(false);
  readonly reportUncertain = signal(false);
  readonly reportFile = signal<File | null>(null);
  readonly documentFile = signal<File | null>(null);
  readonly result = signal<CustomsImportResult | null>(null);
  readonly documentKind = signal<DocumentKind>('assessment');
  readonly lookup = this.fb.nonNullable.group({ reference: [''] });
  readonly filters = this.fb.nonNullable.group({ query: [''] });
  readonly report = this.fb.nonNullable.group({
    customs_manifest: [''],
    mawb_number: [''],
    airline: [''],
  });
  readonly status = customsStatuses;
  readonly groups = importGroups;
  readonly money = customsMoney;
  readonly date = formatDate;
  readonly importDialog = viewChild.required<ElementRef<HTMLDialogElement>>('importDialog');
  readonly documentDialog = viewChild.required<ElementRef<HTMLDialogElement>>('documentDialog');
  readonly releaseDialog = viewChild.required<ElementRef<HTMLDialogElement>>('releaseDialog');
  readonly reportInput = viewChild.required<ElementRef<HTMLInputElement>>('reportInput');
  readonly documentInput = viewChild.required<ElementRef<HTMLInputElement>>('documentInput');
  readonly resultHeading = viewChild<ElementRef<HTMLHeadingElement>>('resultHeading');
  readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('detailHeading');
  private listRequest?: Subscription;
  private detailRequest?: Subscription;
  private documentTarget = '';
  private releaseTarget = '';
  private uploadedDocument = '';
  private lastDetailId = '';
  constructor() {
    this.load();
    const id = this.route.snapshot.queryParamMap.get('line_id');
    if (id) {
      this.lookup.controls.reference.setValue(id);
      this.openReference();
    }
    this.destroyRef.onDestroy(() => {
      this.listRequest?.unsubscribe();
      this.detailRequest?.unsubscribe();
    });
  }
  get lastDetailAvailable() {
    return !!this.lastDetailId && !this.selected();
  }
  readonly appliedFilter = signal('');
  applyFilter() {
    this.appliedFilter.set(this.filters.controls.query.value.trim().toLocaleLowerCase('es'));
  }
  get visibleLines() {
    const q = this.appliedFilter();
    return this.lines().filter((l) =>
      [l.guide, l.declaration, l.customs_manifest].some((v) =>
        v.toLocaleLowerCase('es').includes(q),
      ),
    );
  }
  get canAct() {
    return (
      this.auth.manager() &&
      !!this.selected() &&
      !this.busy() &&
      !this.detailLoading() &&
      !this.stale() &&
      this.selected()?.status !== 'released'
    );
  }
  get canReleaseSelected() {
    const line = this.selected();
    return !!line && this.canAct && canRelease(line);
  }
  get canImport() {
    return (
      this.auth.manager() &&
      !!this.reportFile() &&
      !reportFileError(this.reportFile()!) &&
      validManifest(this.report.controls.customs_manifest.value) &&
      !this.busy() &&
      !this.reportUncertain()
    );
  }
  get canAttach() {
    return (
      this.canAct &&
      this.attaching() &&
      this.documentTarget === this.selected()?.id &&
      !!this.documentFile() &&
      !fileError(this.documentFile()!)
    );
  }
  load() {
    if (!this.auth.manager() || this.busy()) return;
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.listError.set('');
    this.listRequest = this.api.pending().subscribe({
      next: (lines) => {
        this.lines.set(lines);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.listError.set(requestMessage(error));
        this.loading.set(false);
      },
    });
  }
  openReference() {
    if (this.busy() || this.importing() || this.attaching() || this.releasing()) return;
    const id = customsReference(this.lookup.controls.reference.value, location.origin);
    if (!id) {
      this.error.set('Selecciona el registro en el buscador por código.');
      return;
    }
    this.selectId(id);
  }
  select(line: CustomsLine) {
    if (this.busy() || this.attaching() || this.releasing() || this.importing()) return;
    this.selectId(line.id);
  }
  selectId(id: string) {
    if (this.busy() || this.attaching() || this.releasing() || this.importing()) return;
    this.selected.set(null);
    this.notice.set('');
    this.read(id);
  }
  reloadDetail() {
    if (!this.busy() && this.lastDetailId) this.read(this.lastDetailId);
  }
  private read(id: string, preserveError = false) {
    this.detailRequest?.unsubscribe();
    this.lastDetailId = id;
    this.detailLoading.set(true);
    this.stale.set(true);
    if (!preserveError) this.error.set('');
    this.detailRequest = this.api.get(id).subscribe({
      next: (line) => {
        this.apply(line);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        this.detailLoading.set(false);
        this.error.set(`${requestMessage(error)} Actualiza el detalle antes de operar.`);
      },
    });
  }
  private apply(line: CustomsLine) {
    this.selected.set(line);
    this.stale.set(false);
    this.lastDetailId = line.id;
    this.lookup.controls.reference.setValue(line.id);
    this.lines.update((lines) =>
      line.status === 'released'
        ? lines.filter((l) => l.id !== line.id)
        : lines.map((l) => (l.id === line.id ? line : l)),
    );
    void this.router.navigate([], {
      queryParams: { line_id: line.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  startImport() {
    if (!this.auth.manager() || this.busy()) return;
    this.report.reset();
    this.reportFile.set(null);
    this.reportInput().nativeElement.value = '';
    this.modalError.set('');
    this.rowErrors.set([]);
    this.reportUncertain.set(false);
    this.importing.set(true);
    this.importDialog().nativeElement.showModal();
  }
  cancelImport(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.importDialog().nativeElement.close();
    this.importing.set(false);
    this.reportFile.set(null);
    this.report.reset();
    this.modalError.set('');
    this.rowErrors.set([]);
  }
  chooseReport(event: Event) {
    if (this.busy()) return;
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.reportFile.set(file);
    this.modalError.set(file ? reportFileError(file) : '');
    this.rowErrors.set([]);
  }
  importReport() {
    if (!this.importing() || !this.canImport) return;
    const file = this.reportFile()!,
      value = this.report.getRawValue();
    this.busy.set(true);
    this.modalError.set('');
    this.rowErrors.set([]);
    this.notice.set('');
    this.api
      .importReport(file, value.customs_manifest, value.mawb_number, value.airline)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.busy.set(false);
          this.cancelImport();
          this.notice.set('Reporte procesado. Revisa el resultado de cada grupo de guías.');
          this.load();
          if (this.selected()) this.read(this.selected()!.id);
          this.focusDetail();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.modalError.set(requestMessage(error));
          const problem = (error as { error?: ApiProblem } | null)?.error;
          this.rowErrors.set(Object.entries(problem?.errors ?? {}));
          if (this.needsRefresh(error)) {
            this.reportUncertain.set(true);
            this.load();
            if (this.selected()) this.read(this.selected()!.id, true);
            this.modalError.set(
              `${requestMessage(error)} El reporte puede haberse procesado. Cancela y actualiza los pendientes antes de decidir si necesitas reimportarlo.`,
            );
          }
        },
      });
  }
  startDocument(kind: DocumentKind) {
    if (!this.canAct) return;
    this.documentTarget = this.selected()!.id;
    this.documentKind.set(kind);
    this.documentFile.set(null);
    this.uploadedDocument = '';
    this.documentInput().nativeElement.value = '';
    this.modalError.set('');
    this.attaching.set(true);
    this.documentDialog().nativeElement.showModal();
  }
  chooseDocument(event: Event) {
    if (this.busy()) return;
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.documentFile.set(file);
    this.uploadedDocument = '';
    this.modalError.set(file ? fileError(file) : '');
  }
  cancelDocument(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.documentDialog().nativeElement.close();
    this.attaching.set(false);
    this.documentTarget = '';
    this.documentFile.set(null);
    this.uploadedDocument = '';
    this.modalError.set('');
    if (!this.canAct) this.focusDetail();
  }
  saveDocument() {
    if (!this.canAttach) return;
    const id = this.documentTarget,
      kind = this.documentKind();
    this.busy.set(true);
    this.modalError.set('');
    this.notice.set('');
    const upload = this.uploadedDocument
      ? of({ id: this.uploadedDocument })
      : this.documents.upload(this.documentFile()!);
    let associating = false;
    upload
      .pipe(
        switchMap((document) => {
          this.uploadedDocument = document.id;
          associating = true;
          return this.api.attach(id, kind, document.id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (line) => {
          this.apply(line);
          this.busy.set(false);
          this.cancelDocument();
          this.notice.set('Documento adjuntado. La liberación requiere confirmación por separado.');
          this.focusDetail();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.modalError.set(requestMessage(error));
          if (associating && this.needsRefresh(error)) this.read(id, true);
        },
      });
  }
  prepareRelease() {
    if (!this.canReleaseSelected) return;
    this.releaseTarget = this.selected()!.id;
    this.modalError.set('');
    this.releasing.set(true);
    this.releaseDialog().nativeElement.showModal();
  }
  cancelRelease(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.releaseDialog().nativeElement.close();
    this.releasing.set(false);
    this.releaseTarget = '';
    this.modalError.set('');
    this.focusDetail();
  }
  release() {
    if (!this.releasing() || !this.canReleaseSelected || this.releaseTarget !== this.selected()?.id)
      return;
    const id = this.releaseTarget;
    this.busy.set(true);
    this.modalError.set('');
    this.notice.set('');
    this.api
      .release(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (line) => {
          this.apply(line);
          this.busy.set(false);
          this.cancelRelease();
          this.notice.set(`Guía ${line.guide} liberada según el backend.`);
          this.load();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.modalError.set(requestMessage(error));
          if (this.needsRefresh(error)) {
            this.read(id, true);
            this.load();
          }
        },
      });
  }
  private needsRefresh(error: unknown) {
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    return status === 0 || status === 409 || (status >= 200 && status < 300) || status >= 500;
  }
  private focusDetail() {
    afterNextRender(
      () => (this.heading()?.nativeElement ?? this.resultHeading()?.nativeElement)?.focus(),
      { injector: this.injector },
    );
  }
  viewDocument(id: string, title: string) {
    if (this.busy()) return;
    this.preview.open(title, `${title}.pdf`, () =>
      this.documents.download(id).pipe(switchMap((link) => this.preview.fetch(link.url))),
    );
  }
  downloadDocument(id: string, title: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.preview
      .download(`${title}.pdf`, () =>
        this.documents.download(id).pipe(switchMap((link) => this.preview.fetch(link.url))),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.busy.set(false),
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(requestMessage(error));
        },
      });
  }
}
