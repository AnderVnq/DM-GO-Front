import { Component, effect, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { RuntimeConfig } from '../../core/runtime-config';
import { RouteMap, type LivePosition } from './route-map';
import type { RouteStop } from './delivery-route.model';
@Component({
  selector: 'app-route-live',
  imports: [RouteMap],
  template: `<section class="detail-section">
    <h3>Seguimiento del repartidor</h3>
    <p role="status">{{ status() }}</p>
    @if (position(); as p) {
      <p class="muted">
        Última posición: {{ time(p.recorded_at) }}. Comprueba la hora antes de usarla como
        referencia.
      </p>
    }
    <app-route-map [stops]="stops()" [position]="position()" />
    <button class="button" (click)="retry.update(increment)">Reconectar seguimiento</button>
  </section>`,
})
export class RouteLive {
  readonly routeId = input.required<string>();
  readonly audience = input<'operations' | 'portal'>('operations');
  readonly stops = input<readonly RouteStop[]>([]);
  readonly status = signal('Conectando seguimiento…');
  readonly position = signal<LivePosition | null>(null);
  readonly retry = signal(0);
  readonly increment = (n: number) => n + 1;
  private previousRoute = '';
  private readonly auth = inject(AuthService);
  private readonly config = inject(RuntimeConfig);
  readonly time = (s: string) => new Date(s).toLocaleString('es-PE');
  constructor() {
    effect((cleanup) => {
      const id = this.routeId();
      const audience = this.audience();
      this.retry();
      const controller = new AbortController();
      if (this.previousRoute !== id) this.position.set(null);
      this.previousRoute = id;
      this.status.set('Conectando seguimiento…');
      void this.read(id, controller, audience);
      cleanup(() => controller.abort());
    });
  }
  private async read(id: string, controller: AbortController, audience: 'operations' | 'portal') {
    try {
      const token = await this.auth.validToken();
      if (controller.signal.aborted) return;
      const response = await fetch(
        `${this.config.value.apiBaseUrl}/${audience === 'portal' ? 'portal/packages' : 'routes'}/${encodeURIComponent(id)}/live`,
        {
          signal: controller.signal,
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      )
        throw new Error(
          response.status === 409
            ? 'La ruta ya no está en reparto.'
            : 'No se pudo conectar al seguimiento.',
        );
      this.status.set('Conectado · esperando ubicación del repartidor.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 65536)
            throw new Error('Respuesta de seguimiento inválida. Vuelve a conectar.');
          buffer = buffer.replace(/\r\n/g, '\n');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            if (event.includes('event: end')) {
              this.status.set('Seguimiento finalizado.');
              return;
            }
            if (!event.includes('event: location')) continue;
            const data = event
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n');
            const p = JSON.parse(data) as LivePosition;
            if (
              !Number.isFinite(p.lat) ||
              !Number.isFinite(p.lng) ||
              Math.abs(p.lat) > 90 ||
              Math.abs(p.lng) > 180 ||
              !Number.isFinite(Date.parse(p.recorded_at))
            )
              continue;
            this.position.set(p);
            this.status.set('Conectado · posición recibida.');
          }
        }
        if (!controller.signal.aborted)
          this.status.set('Conexión cerrada. Reconecta para recibir nuevas posiciones.');
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch (error) {
      if (!controller.signal.aborted)
        this.status.set(error instanceof Error ? error.message : 'Seguimiento sin conexión.');
    }
  }
}
