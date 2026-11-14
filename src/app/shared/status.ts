import { Component, computed, input } from '@angular/core';

const labels: Record<string, string> = {
  open: 'Abierto',
  closed: 'Cerrado',
  PREALERTED: 'Prealertado',
  RECEIVED_USA: 'Recibido en USA',
  CONSOLIDATED: 'Consolidado',
  IN_TRANSIT: 'En tránsito',
  ARRIVED_LIMA: 'Recibido en Lima',
  IN_CUSTOMS: 'En aduana',
  RELEASED: 'Liberado',
  READY_FOR_DELIVERY: 'Listo para entrega',
  OUT_FOR_DELIVERY: 'En reparto',
  DELIVERED: 'Entregado',
  DELIVERY_FAILED: 'Entrega fallida',
  ON_HOLD: 'En observación',
  RETURNED: 'Devuelto',
  ABANDONED: 'Abandonado',
  SPLIT: 'Dividido',
  ASSIGNED_TRAVELER: 'Asignado a viajero',
  draft: 'Borrador',
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  cancelled: 'Anulado',
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  pending_send: 'Pendiente de envío',
  sent: 'Enviado',
  exception: 'Descartado',
};
export function statusLabel(value: string): string {
  return labels[value] ?? value.replaceAll('_', ' ').toLowerCase();
}

@Component({
  selector: 'app-status',
  template:
    '<span class="status" [attr.data-tone]="tone()"><span class="status-dot"></span>{{ label() }}</span>',
})
export class Status {
  readonly value = input.required<string>();
  readonly label = computed(() => statusLabel(this.value()));
  readonly tone = computed(() => {
    if (
      ['paid', 'accepted', 'RELEASED', 'DELIVERED', 'READY_FOR_DELIVERY', 'RECEIVED_USA'].includes(
        this.value(),
      )
    )
      return 'success';
    if (
      ['cancelled', 'rejected', 'DELIVERY_FAILED', 'RETURNED', 'ABANDONED'].includes(this.value())
    )
      return 'danger';
    if (['pending_payment', 'IN_CUSTOMS', 'ON_HOLD', 'expired'].includes(this.value()))
      return 'warning';
    return 'neutral';
  });
}
