import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type * as Leaflet from 'leaflet';
export interface AddressPoint {
  lat: number;
  lng: number;
}
@Component({
  selector: 'app-address-point-picker',
  template: `<div
      #canvas
      class="point-map"
      role="region"
      aria-label="Seleccionar punto de entrega en el mapa"
    ></div>
    <p class="fine-print">
      Pulsa en el mapa para marcar la puerta. También puedes introducir las coordenadas en los
      campos inferiores.
    </p>
    @if (error()) {
      <p class="alert" role="status">{{ error() }}</p>
    }`,
  styles: `
    :host {
      display: block;
    }
    .point-map {
      height: 16rem;
      background: var(--surface-inset);
      border-radius: 0.75rem;
      z-index: 0;
    }
    .fine-print {
      margin-block: 0.5rem 1rem;
    }
  `,
})
export class AddressPointPicker {
  readonly point = input<AddressPoint | null>(null);
  readonly center = input<AddressPoint | null>(null);
  readonly disabled = input(false);
  readonly picked = output<AddressPoint>();
  readonly error = signal('');
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly ready = signal(false);
  private map?: Leaflet.Map;
  private marker?: Leaflet.CircleMarker;
  private library?: typeof Leaflet;
  private alive = true;
  constructor() {
    afterNextRender(async () => {
      try {
        const L = await import('leaflet');
        if (!this.alive) return;
        this.library = L;
        this.map = L.map(this.canvas().nativeElement, { scrollWheelZoom: false }).setView(
          [-12.05, -77.04],
          11,
        );
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
          .addTo(this.map)
          .on('tileerror', () =>
            this.error.set(
              'No se pudo cargar el mapa. Puedes escribir las coordenadas o guardar sin punto.',
            ),
          );
        this.map.on('click', (e: Leaflet.LeafletMouseEvent) => {
          if (!this.disabled())
            this.picked.emit({
              lat: Number(e.latlng.lat.toFixed(6)),
              lng: Number(e.latlng.lng.toFixed(6)),
            });
        });
        this.ready.set(true);
      } catch {
        if (this.alive)
          this.error.set(
            'No se pudo abrir el mapa. Puedes introducir las coordenadas o guardar sin punto.',
          );
      }
    });
    effect(() => {
      const point = this.point(),
        center = this.center();
      if (!this.ready()) return;
      this.marker?.remove();
      if (point)
        this.marker = this.library!.circleMarker([point.lat, point.lng], {
          color: '#805006',
          fillColor: '#F4B942',
          fillOpacity: 0.9,
          radius: 9,
        }).addTo(this.map!);
      const focus = point ?? center;
      if (focus) this.map!.setView([focus.lat, focus.lng], point ? 16 : 13, { animate: false });
      this.map!.invalidateSize();
    });
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.map?.remove();
    });
  }
}
