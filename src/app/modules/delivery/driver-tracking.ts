import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RuntimeConfig } from '../../core/runtime-config';
import { Subscription, timeout } from 'rxjs';
import { requestMessage } from '../../core/api-problem';
@Component({
  selector: 'app-driver-tracking',
  template: `<section class="detail-section">
    <h3>Compartir ubicación de esta ruta</h3>
    <p class="muted">
      Operaciones podrá ver tu posición mientras esta ruta esté en reparto y esta pantalla
      permanezca abierta. Puedes detener el envío en cualquier momento.
    </p>
    <div class="actions">
      <button class="button" (click)="watch === null ? start() : stop()">
        {{ watch === null ? 'Compartir ubicación' : 'Detener ubicación' }}</button><span
        role="status"
        >{{ message() }}</span
      >
    </div>
    @if (error()) {
      <p class="alert error" role="alert">{{ error() }}</p>
    }
  </section>`,
})
export class DriverTracking {
  readonly routeId = input.required<string>();
  readonly active = input(false);
  readonly message = signal('Ubicación sin compartir.');
  readonly error = signal('');
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  watch: number | null = null;
  private lastSent = 0;
  private request?: Subscription;
  private sending = false;
  constructor() {
    effect(() => {
      this.routeId();
      this.active();
      this.stop();
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }
  start() {
    if (!this.active() || this.watch !== null) return;
    this.error.set('');
    if (!window.isSecureContext || !navigator.geolocation) {
      this.error.set(
        'Para compartir GPS desde el celular abre la aplicación mediante HTTPS y permite el acceso a la ubicación.',
      );
      return;
    }
    this.lastSent = 0;
    this.message.set('Buscando señal GPS…');
    this.watch = navigator.geolocation.watchPosition(
      (p) => {
        if (
          this.watch === null ||
          !this.active() ||
          this.sending ||
          Date.now() - this.lastSent < 10000
        )
          return;
        this.sending = true;
        this.request = this.http
          .post(`${this.config.value.apiBaseUrl}/driver/locations`, {
            points: [
              {
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
                accuracy_m: p.coords.accuracy,
                recorded_at: new Date(p.timestamp).toISOString(),
              },
            ],
          })
          .pipe(timeout(15000))
          .subscribe({
            next: () => {
              this.sending = false;
              this.lastSent = Date.now();
              this.error.set('');
              this.message.set(`Ubicación enviada · ${new Date().toLocaleTimeString('es-PE')}`);
            },
            error: (e) => {
              this.sending = false;
              this.error.set(requestMessage(e));
              if (e.status === 401 || e.status === 403 || e.status === 409) this.stop();
            },
          });
      },
      (e) => {
        this.error.set(
          e.code === 1
            ? 'Acceso a ubicación denegado. Habilítalo en los permisos del navegador.'
            : 'No se pudo obtener el GPS. Detén el envío y vuelve a intentarlo.',
        );
        this.stop();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }
  stop() {
    if (this.watch !== null) navigator.geolocation.clearWatch(this.watch);
    this.watch = null;
    this.request?.unsubscribe();
    this.sending = false;
    this.message.set('Ubicación sin compartir.');
  }
}
