import {
  Component,
  ElementRef,
  afterNextRender,
  effect,
  input,
  signal,
  viewChild,
  DestroyRef,
  inject,
} from '@angular/core';
import type * as Leaflet from 'leaflet';
import type { RouteStop } from './delivery-route.model';
export interface LivePosition {
  lat: number;
  lng: number;
  recorded_at: string;
  accuracy_m?: number;
}
@Component({
  selector: 'app-route-map',
  template: `<div class="map-frame">
      <div #canvas class="route-map" role="region" aria-label="Mapa de paradas de reparto"></div>
      @if (loading()) {
        <div class="map-loading">
          <progress class="loading-spinner" aria-label="Cargando mapa"></progress>
        </div>
      }
    </div>
    @if (error()) {
      <p class="alert" role="status">{{ error() }}</p>
    }
    <p class="map-hint">
      Ámbar: punto de dirección · Círculo: centro de distrito aproximado · Ciruela: repartidor. El
      mapa no calcula el recorrido.
    </p>`,
  styles: `
    .map-frame {
      position: relative;
    }
    .map-loading {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
      z-index: 1;
    }
    :host {
      display: block;
      margin-block: 1.25rem;
    }
    .route-map {
      height: clamp(16rem, 38vw, 24rem);
      border-radius: 0.75rem;
      overflow: hidden;
      z-index: 0;
      background: var(--surface-inset);
    }
    .map-hint {
      font-size: 0.75rem;
      color: var(--muted);
      margin: 0.75rem 0;
      line-height: 1.6;
    }
  `,
})
export class RouteMap {
  readonly stops = input<readonly RouteStop[]>([]);
  readonly position = input<LivePosition | null>(null);
  readonly error = signal('');
  readonly loading = signal(true);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly ready = signal(false);
  private map?: Leaflet.Map;
  private layer?: Leaflet.LayerGroup;
  private library?: typeof Leaflet;
  private fitted = false;
  private stopKey = '';
  private hadPosition = false;
  private alive = true;
  constructor() {
    afterNextRender(async () => {
      try {
        const L = await import('leaflet');
        if (!this.alive) return;
        this.library = L;
        this.map = L.map(this.canvas().nativeElement, { scrollWheelZoom: false }).setView(
          [-9.19, -75.02],
          5,
        );
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
          .addTo(this.map)
          .on('tileerror', () =>
            this.error.set(
              'No se pudo cargar el mapa base. Puedes usar las direcciones y «Cómo llegar».',
            ),
          );
        this.map.eachLayer((layer) => {
          if (layer instanceof L.TileLayer) {
            layer.on('load', () => this.loading.set(false));
            layer.on('tileerror', () => this.loading.set(false));
          }
        });
        this.layer = L.layerGroup().addTo(this.map);
        this.ready.set(true);
      } catch {
        this.loading.set(false);
        this.error.set('No se pudo abrir el mapa. Usa las direcciones de las paradas.');
      }
    });
    effect(() => {
      const stops = this.stops(),
        point = this.position();
      if (!this.ready()) return;
      const L = this.library!,
        map = this.map!,
        layer = this.layer!;
      layer.clearLayers();
      const bounds: Leaflet.LatLngTuple[] = [];
      for (const stop of stops) {
        const p = stop.location;
        if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        bounds.push([p.lat, p.lng]);
        const text = document.createElement('span');
        text.textContent = `Parada ${stop.seq}: ${stop.recipient_name} · ${p.precision === 'address' ? 'Punto de dirección' : 'Centro del distrito (aproximado)'}`;
        L.circleMarker([p.lat, p.lng], {
          radius: p.precision === 'address' ? 9 : 15,
          color: '#805006',
          fillColor: '#F4B942',
          fillOpacity: p.precision === 'address' ? 0.9 : 0.25,
          weight: 2,
        })
          .bindTooltip(text)
          .addTo(layer);
      }
      if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
        bounds.push([point.lat, point.lng]);
        L.circleMarker([point.lat, point.lng], {
          radius: 10,
          color: '#fff',
          fillColor: '#1B1127',
          fillOpacity: 1,
          weight: 3,
        })
          .bindTooltip('Última ubicación del repartidor')
          .addTo(layer);
      }
      const key = stops.map((stop) => stop.id).join(',');
      if (key !== this.stopKey || (!!point && !this.hadPosition)) this.fitted = false;
      this.stopKey = key;
      this.hadPosition = !!point;
      if (!this.fitted && bounds.length) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35], maxZoom: 15, animate: false });
        this.fitted = true;
      }
      map.invalidateSize();
    });
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.map?.remove();
    });
  }
}
