import { formatMeasuredWeight } from '../../shared/weight';
import { Component, input } from '@angular/core';
import type { GuideCard } from './consolidation.model';
import { formatUsd } from '../../shared/amount';

@Component({
  selector: 'app-guide-package-card',
  template: `
    <div class="identity">
      <strong>{{ card().locker_code || 'Sin casillero' }}</strong><span>{{
        card().carrier_tracking
      }}</span>
    </div>
    <p>{{ card().description }}</p>
    <p class="muted">{{ card().store }}</p>
    <p class="numeric">
      {{ money(card().unit_value_cents) }} por unidad · Cantidad {{ card().quantity }}
    </p>
    @if (card().wr || card().weight_kg !== undefined || card().weight_g !== undefined) {
      <p class="fine-print">
        {{ card().wr ? 'WR ' + card().wr : '' }}
        {{ measuredWeight(card()) }}
      </p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        overflow-wrap: anywhere;
      }
      p {
        margin: 0.35rem 0;
      }
      .identity {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.5rem;
      }
    `,
  ],
})
export class GuidePackageCard {
  readonly card = input.required<GuideCard>();
  readonly money = formatUsd;
  readonly measuredWeight = formatMeasuredWeight;
}
