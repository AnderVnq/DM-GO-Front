import { Icon } from '../../shared/icon';
import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, switchMap } from 'rxjs';
import { ConsolidationApi } from './consolidation-api';
import type { GuideBoard } from './consolidation.model';
import { GuidePackageCard } from './guide-package-card';
import { requestCode, requestMessage } from '../../core/api-problem';

@Component({
  selector: 'app-guide-groups-page',
  imports: [Icon, RouterLink, GuidePackageCard],
  templateUrl: './guide-groups-page.html',
  styleUrl: './guide-groups-page.scss',
})
export class GuideGroupsPage {
  private readonly api = inject(ConsolidationApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly board = signal<GuideBoard | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly filter = signal('');
  readonly destinations = signal<Record<string, string>>({});
  chooseTarget(id: string, value: string) {
    this.destinations.update((items) => ({ ...items, [id]: value }));
  }
  hasDestination(id: string) {
    return this.targets().some((target) => target.id === this.destinations()[id]);
  }
  readonly drafts = signal<string[]>([]);
  private nextDraft = 0;
  readonly editable = computed(
    () => this.board()?.status === 'open' && !this.loading() && !this.busy(),
  );
  readonly available = computed(
    () =>
      this.board()?.ungrouped.filter((card) =>
        `${card.carrier_tracking} ${card.locker_code}`
          .toLowerCase()
          .includes(this.filter().trim().toLowerCase()),
      ) ?? [],
  );
  readonly targets = computed(() => [
    ...(this.board()?.groups ?? []).map((g, index) => ({ id: g.id, label: `Grupo ${index + 1}` })),
    ...this.drafts().map((id, index) => ({
      id,
      label: `Nuevo grupo ${(this.board()?.groups.length ?? 0) + index + 1}`,
    })),
  ]);
  constructor() {
    this.reload();
  }
  reload() {
    if (this.busy() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .guideGroups(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (board) => {
          this.setBoard(board);
          this.loading.set(false);
          if (board.status === 'closed') this.drafts.set([]);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(requestMessage(error));
        },
      });
  }
  addGroup() {
    if (!this.editable()) return;
    const id = `draft-${++this.nextDraft}`;
    this.drafts.update((items) => [...items, id]);
    this.notice.set('Grupo vacío creado. Mueve un paquete para guardarlo.');
    this.focus(id);
  }
  move(packageId: string, targetId: string) {
    if (!this.editable()) return;
    const board = this.board();
    const card = board?.ungrouped.find((p) => p.id === packageId);
    if (!board || !card) return;
    const group = board.groups.find((g) => g.id === targetId);
    if (!group && !this.drafts().includes(targetId)) return;
    if (
      group?.packages.some(
        (p) =>
          p.customer_id !== card.customer_id ||
          (p.consignee_id ?? '') !== (card.consignee_id ?? ''),
      )
    ) {
      this.error.set('Una guía solo admite paquetes del mismo cliente y consignatario.');
      return;
    }
    this.mutate(
      group
        ? this.api.updateGuideGroup(group.id, [...group.packages.map((p) => p.id), packageId])
        : this.api.createGuideGroup(this.id, [packageId]),
      'Paquete añadido al grupo.',
      (result) => {
        this.drafts.update((items) => items.filter((id) => id !== targetId));
        return (
          group?.id ??
          result.groups.find((g) => g.packages.some((p) => p.id === packageId))?.id ??
          'available'
        );
      },
    );
  }
  remove(groupId: string, packageId: string) {
    if (!this.editable()) return;
    const group = this.board()?.groups.find((g) => g.id === groupId);
    if (!group?.packages.some((p) => p.id === packageId)) return;
    const ids = group.packages.filter((p) => p.id !== packageId).map((p) => p.id);
    if (!ids.length) {
      this.deleteGroup(groupId);
      return;
    }
    this.mutate(
      this.api.updateGuideGroup(groupId, ids),
      'Paquete devuelto a casilleros disponibles.',
      () => 'available',
    );
  }
  deleteGroup(id: string) {
    if (!this.editable()) return;
    if (this.drafts().includes(id)) {
      this.drafts.update((items) => items.filter((entry) => entry !== id));
      this.focus('groups');
      return;
    }
    if (!this.board()?.groups.some((g) => g.id === id)) return;
    this.mutate(
      this.api.deleteGuideGroup(id).pipe(switchMap(() => this.api.guideGroups(this.id))),
      'Grupo eliminado. Sus paquetes vuelven a disponibles.',
      () => 'available',
    );
  }
  reorder(id: string, direction: number) {
    if (!this.editable()) return;
    const ids = this.board()?.groups.map((g) => g.id) ?? [];
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    this.mutate(
      this.api.orderGuideGroups(this.id, ids),
      'Orden del manifiesto actualizado.',
      () => id,
    );
  }
  startDrag(event: DragEvent, id: string) {
    if (!this.editable()) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('application/x-dm48-package', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  allowDrop(event: DragEvent) {
    if (this.editable() && event.dataTransfer?.types.includes('application/x-dm48-package'))
      event.preventDefault();
  }
  drop(event: DragEvent, groupId: string) {
    event.preventDefault();
    this.move(event.dataTransfer?.getData('application/x-dm48-package') ?? '', groupId);
  }
  private setBoard(board: GuideBoard) {
    this.board.set({
      ...board,
      groups: [...(board.groups ?? [])].sort((a, b) => a.position - b.position),
      ungrouped: board.ungrouped ?? [],
    });
  }
  private mutate(
    operation: Observable<GuideBoard>,
    message: string,
    focus: (board: GuideBoard) => string,
  ) {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    operation.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (board) => {
        this.setBoard(board);
        this.busy.set(false);
        this.notice.set(message);
        this.focus(focus(board));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const messages: Record<string, string> = {
          guide_group_mixed: 'Una guía solo admite paquetes del mismo cliente y consignatario.',
          guide_group_package:
            'El paquete cambió o ya pertenece a otro grupo. Actualiza el tablero.',
          consolidation_not_open:
            'El consolidado está cerrado. Actualiza el tablero para verlo en modo lectura.',
          guide_group_not_found: 'El grupo ya no existe. Actualiza el tablero.',
        };
        if (requestCode(error) === 'consolidation_not_open') {
          this.board.update((board) => (board ? { ...board, status: 'closed' } : null));
          this.drafts.set([]);
        }
        this.error.set(messages[requestCode(error)] ?? requestMessage(error));
      },
    });
  }
  private focus(id: string) {
    afterNextRender(() => this.document.getElementById(`awb-${id}`)?.focus(), {
      injector: this.injector,
    });
  }
}
