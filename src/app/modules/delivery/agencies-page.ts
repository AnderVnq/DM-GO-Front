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
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { requestMessage, type ApiProblem } from '../../core/api-problem';
import { Icon } from '../../shared/icon';
import { AgenciesApi } from './agencies-api';
import type { TransitAgency, AgencyBranch } from './agency.model';
import { normalizeAgency, normalizeBranch, validAgency, validBranch } from './agency-rules';
@Component({
  selector: 'app-agencies-page',
  imports: [LoadingIndicator, ReactiveFormsModule, Icon],
  templateUrl: './agencies-page.html',
  styleUrl: './agencies-page.scss',
})
export class AgenciesPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(AgenciesApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  readonly items = signal<TransitAgency[]>([]);
  readonly selectedId = signal('');
  readonly includeInactive = signal(false);
  readonly loading = signal(false);
  readonly stale = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly mode = signal<'agency' | 'branch' | null>(null);
  readonly modalError = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly uncertain = signal(false);
  readonly duplicateCode = signal('');
  readonly modalParent = signal<TransitAgency | null>(null);
  readonly filter = this.fb.nonNullable.group({ query: [''] });
  readonly agencyForm = this.fb.nonNullable.group({
    code: [''],
    name: [''],
    dropoff_ubigeo: [''],
    dropoff_address: [''],
  });
  readonly branchForm = this.fb.nonNullable.group({ name: [''], ubigeo: [''], address: [''] });
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('createDialog');
  readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('agencyHeading');
  private request?: Subscription;
  constructor() {
    this.includeInactive.set(this.route.snapshot.queryParamMap.get('all') === 'true');
    this.selectedId.set(this.route.snapshot.queryParamMap.get('agency_id') ?? '');
    this.load();
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
  }
  get selected() {
    return this.items().find((a) => a.id === this.selectedId()) ?? null;
  }
  get filtered() {
    const q = this.filter.controls.query.value.trim().toLocaleLowerCase('es');
    return this.items().filter((a) =>
      `${a.code} ${a.name} ${a.dropoff_ubigeo} ${a.dropoff_address}`
        .toLocaleLowerCase('es')
        .includes(q),
    );
  }
  get canSave() {
    if (
      !this.auth.admin() ||
      !this.mode() ||
      this.busy() ||
      this.loading() ||
      this.stale() ||
      this.uncertain()
    )
      return false;
    if (this.mode() === 'agency') {
      const value = normalizeAgency(this.agencyForm.getRawValue());
      return validAgency(value) && value.code !== this.duplicateCode();
    }
    const parent = this.items().find((a) => a.id === this.modalParent()?.id);
    return !!parent?.active && validBranch(this.branchForm.getRawValue());
  }
  load(targetId = this.selectedId()) {
    if (this.busy()) return;
    this.request?.unsubscribe();
    this.loading.set(true);
    this.stale.set(true);
    this.error.set('');
    this.request = this.api.list(this.includeInactive()).subscribe({
      next: (items) => {
        this.items.set(items);
        this.selectedId.set(items.some((a) => a.id === targetId) ? targetId : '');
        this.loading.set(false);
        this.stale.set(false);
        this.updateUrl();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(
          `${requestMessage(error)} Actualiza el catálogo antes de registrar nuevas agencias o sucursales.`,
        );
      },
    });
  }
  toggleInactive(event: Event) {
    if (this.busy() || this.mode()) return;
    this.includeInactive.set((event.target as HTMLInputElement).checked);
    this.load();
  }
  select(agency: TransitAgency) {
    if (
      this.busy() ||
      this.loading() ||
      this.mode() ||
      !this.items().some((a) => a.id === agency.id)
    )
      return;
    this.selectedId.set(agency.id);
    this.updateUrl();
    this.focusHeading();
  }
  private updateUrl() {
    void this.router.navigate([], {
      queryParams: {
        agency_id: this.selectedId() || null,
        all: this.includeInactive() ? 'true' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  startAgency() {
    if (!this.auth.admin() || this.busy() || this.loading() || this.stale() || this.mode()) return;
    this.agencyForm.reset();
    this.start('agency');
  }
  startBranch() {
    const parent = this.selected;
    if (
      !this.auth.admin() ||
      !parent?.active ||
      this.busy() ||
      this.loading() ||
      this.stale() ||
      this.mode()
    )
      return;
    this.modalParent.set({ ...parent });
    this.branchForm.reset();
    this.start('branch');
  }
  private start(mode: 'agency' | 'branch') {
    this.modalError.set('');
    this.fieldErrors.set({});
    this.uncertain.set(false);
    this.duplicateCode.set('');
    this.mode.set(mode);
    this.dialog().nativeElement.showModal();
  }
  cancel(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.dialog().nativeElement.close();
    this.mode.set(null);
    this.modalParent.set(null);
    this.agencyForm.reset();
    this.branchForm.reset();
    this.modalError.set('');
    this.fieldErrors.set({});
    if (this.stale()) this.focusHeading();
  }
  save() {
    const mode = this.mode();
    if (!mode || !this.canSave) return;
    this.busy.set(true);
    this.modalError.set('');
    this.fieldErrors.set({});
    this.notice.set('');
    if (mode === 'agency') {
      const input = normalizeAgency(this.agencyForm.getRawValue());
      this.api
        .create(input)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (agency) => {
            this.items.update((items) => [...items.filter((a) => a.id !== agency.id), agency]);
            this.selectedId.set(agency.id);
            this.busy.set(false);
            this.cancel();
            this.notice.set('Agencia creada. Puedes registrar sus sucursales de destino.');
            this.load(agency.id);
            this.focusHeading();
          },
          error: (error: unknown) => {
            this.postError(error);
            if (this.status(error) === 409) this.duplicateCode.set(input.code);
            this.load();
          },
        });
    } else {
      const parentId = this.modalParent()!.id,
        input = normalizeBranch(this.branchForm.getRawValue());
      this.api
        .addBranch(parentId, input)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (branch) => {
            this.applyBranch(parentId, branch);
            this.busy.set(false);
            this.cancel();
            this.notice.set('Sucursal de destino creada.');
            this.load(parentId);
            this.focusHeading();
          },
          error: (error: unknown) => {
            this.postError(error);
            if (this.status(error) === 409) this.uncertain.set(true);
            this.load(parentId);
          },
        });
    }
  }
  private applyBranch(id: string, branch: AgencyBranch) {
    this.items.update((items) =>
      items.map((a) =>
        a.id === id
          ? { ...a, branches: [...a.branches.filter((b) => b.id !== branch.id), branch] }
          : a,
      ),
    );
    this.selectedId.set(id);
  }
  private status(error: unknown) {
    return error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  }
  private postError(error: unknown) {
    this.busy.set(false);
    this.modalError.set(requestMessage(error));
    const problem = (error as { error?: ApiProblem } | null)?.error;
    this.fieldErrors.set(problem?.errors ?? {});
    const status = this.status(error);
    if (status === 0 || (status >= 200 && status < 300) || status >= 500) {
      this.uncertain.set(true);
      this.modalError.set(
        `${requestMessage(error)} El registro puede haberse creado. Cancela y revisa el catálogo actualizado antes de registrar otro.`,
      );
    }
  }
  private focusHeading() {
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}
