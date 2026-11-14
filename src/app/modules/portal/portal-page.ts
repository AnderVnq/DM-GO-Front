import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { requestMessage, requestCode } from '../../core/api-problem';
import { Icon } from '../../shared/icon';
import { PortalApi } from './portal-api';
import type { LockerAddress, PortalProfile } from './portal.model';

@Component({
  selector: 'app-portal-page',
  imports: [RouterLink, ReactiveFormsModule, Icon],
  templateUrl: './portal-page.html',
  styleUrl: './portal-page.scss',
})
export class PortalPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(PortalApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private reading?: Subscription;
  readonly profile = signal<PortalProfile | null>(null);
  readonly state = signal<'loading' | 'onboarding' | 'ready' | 'link' | 'error'>('loading');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly copied = signal('');
  readonly form = this.fb.nonNullable.group({
    doc_type: ['dni' as 'dni' | 'ruc'],
    doc_number: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    name: ['', Validators.required],
    phone: ['', Validators.maxLength(32)],
  });

  constructor() {
    this.load();
    this.destroyRef.onDestroy(() => this.reading?.unsubscribe());
  }

  load() {
    if (this.busy()) return;
    this.reading?.unsubscribe();
    this.state.set('loading');
    this.error.set('');
    this.reading = this.api.me().subscribe({
      next: (profile) => this.showProfile(profile),
      error: (error: unknown) => {
        if (requestCode(error) === 'onboarding_required') this.checkLink();
        else {
          this.error.set(requestMessage(error));
          this.state.set('error');
        }
      },
    });
  }

  private checkLink() {
    this.reading?.unsubscribe();
    this.reading = this.api.linkRequest().subscribe({
      next: (link) => {
        if (link.status === 'pending') this.state.set('link');
        else if (link.status === 'rejected') {
          this.state.set('onboarding');
          this.error.set(
            `Tu solicitud de vinculación no fue aprobada.${link.reason ? ` Motivo: ${link.reason}` : ''}`,
          );
        } else {
          this.state.set('error');
          this.error.set('La vinculación ya se procesó. Vuelve a consultar tu casillero.');
        }
      },
      error: (error: unknown) => {
        if (requestCode(error) === 'link_request_not_found') this.state.set('onboarding');
        else {
          this.error.set(requestMessage(error));
          this.state.set('error');
        }
      },
    });
  }

  create() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy() || this.state() !== 'onboarding') return;
    const input = this.form.getRawValue();
    if (input.doc_number.length !== (input.doc_type === 'dni' ? 8 : 11) || !input.name.trim()) {
      this.error.set(
        'Revisa el documento: DNI de 8 dígitos o RUC de 11 dígitos, y completa tu nombre.',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api
      .onboard({ ...input, name: input.name.trim(), phone: input.phone.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.busy.set(false);
          this.showProfile(profile);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          if (['link_requested', 'already_onboarded'].includes(requestCode(error))) {
            this.load();
            return;
          }
          let message = requestMessage(error);
          if (
            error &&
            typeof error === 'object' &&
            'error' in error &&
            error.error &&
            typeof error.error === 'object' &&
            'errors' in error.error
          ) {
            const fields = error.error.errors;
            if (fields && typeof fields === 'object')
              message +=
                ' ' +
                Object.values(fields)
                  .filter((value) => typeof value === 'string')
                  .join(' ');
          }
          this.error.set(message.trim());
        },
      });
  }

  private showProfile(profile: PortalProfile) {
    this.profile.set(profile);
    this.error.set('');
    this.state.set('ready');
  }

  async copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set('Datos copiados.');
    } catch {
      this.copied.set('No se pudo copiar. Puedes seleccionar el texto y copiarlo manualmente.');
    }
  }

  addressText(address: LockerAddress) {
    return [
      address.recipient,
      address.line1,
      address.line2,
      `${address.city}, ${address.state} ${address.postal_code}`,
      address.country,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
