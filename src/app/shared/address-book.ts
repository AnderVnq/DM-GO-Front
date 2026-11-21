import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, type NgForm } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timeout } from 'rxjs';
import { RuntimeConfig } from '../core/runtime-config';
import { requestMessage } from '../core/api-problem';
import { Icon } from './icon';
import { AddressPointPicker, type AddressPoint } from './address-point-picker';
import type { AddressRecord as DeliveryAddress } from './address.model';
interface District {
  code: string;
  name: string;
  province: string;
  department: string;
  center: AddressPoint | null;
}
interface Draft {
  ubigeo: string;
  line: string;
  reference: string;
  primary: boolean;
  latitude: number | null;
  longitude: number | null;
}
@Component({
  selector: 'app-address-book',
  imports: [FormsModule, Icon, AddressPointPicker],
  templateUrl: './address-book.html',
  styles: `
    :host {
      display: block;
    }
    dialog {
      width: min(44rem, calc(100% - 2rem));
    }
    .address-heading {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
    }
    .address-heading h3 {
      margin: 0;
    }
    .field {
      margin-bottom: 1rem;
    }
    .district-search {
      display: flex;
      gap: 0.5rem;
      align-items: end;
    }
    .district-search .field {
      flex: 1;
    }
    .district-search .button {
      margin-bottom: 1rem;
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0;
      min-width: 0;
    }
    .point-fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
  `,
})
export class AddressBook {
  readonly customerId = input('');
  readonly title = input('Mis direcciones');
  readonly addresses = input<DeliveryAddress[]>([]);
  readonly changed = output<DeliveryAddress[]>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly searchError = signal('');
  readonly searching = signal(false);
  readonly districts = signal<District[]>([]);
  readonly center = signal<AddressPoint | null>(null);
  readonly editing = signal(false);
  readonly removing = signal(false);
  query = '';
  draft: Draft = this.empty();
  private searchRequest?: Subscription;
  private original?: DeliveryAddress;
  private stored = '';
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private readonly destroy = inject(DestroyRef);
  private get base() {
    return this.customerId()
      ? `${this.config.value.apiBaseUrl}/customers/${encodeURIComponent(this.customerId())}/addresses`
      : `${this.config.value.apiBaseUrl}/portal/addresses`;
  }
  private empty(): Draft {
    return { ubigeo: '', line: '', reference: '', primary: false, latitude: null, longitude: null };
  }
  private normalize(d: Draft) {
    return { ...d, ubigeo: d.ubigeo.trim(), line: d.line.trim(), reference: d.reference.trim() };
  }
  get point(): AddressPoint | null {
    return this.draft.latitude !== null &&
      this.draft.longitude !== null &&
      Number.isFinite(this.draft.latitude) &&
      Number.isFinite(this.draft.longitude)
      ? { lat: this.draft.latitude, lng: this.draft.longitude }
      : null;
  }
  get dirty() {
    return JSON.stringify(this.normalize(this.draft)) !== this.stored;
  }
  get valid() {
    const p = this.point;
    return (
      /^\d{6}$/.test(this.draft.ubigeo) &&
      this.draft.line.trim().length >= 3 &&
      (this.draft.latitude === null) === (this.draft.longitude === null) &&
      (!p ||
        (Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          p.lat >= -18.5 &&
          p.lat <= 0.5 &&
          p.lng >= -81.5 &&
          p.lng <= -68))
    );
  }
  open(address?: DeliveryAddress, removing = false) {
    if (this.busy()) return;
    this.searchRequest?.unsubscribe();
    this.searching.set(false);
    this.original = address;
    this.draft = address
      ? {
          ubigeo: address.ubigeo,
          line: address.line,
          reference: address.reference,
          primary: address.primary,
          latitude: address.latitude ?? null,
          longitude: address.longitude ?? null,
        }
      : this.empty();
    this.stored = JSON.stringify(this.normalize(this.draft));
    this.editing.set(!!address);
    this.removing.set(removing);
    this.error.set('');
    this.searchError.set('');
    this.query = '';
    this.districts.set([]);
    this.center.set(null);
    this.dialog().nativeElement.showModal();
  }
  cancel(event?: Event) {
    event?.preventDefault();
    if (this.busy()) return;
    this.searchRequest?.unsubscribe();
    this.searching.set(false);
    this.dialog().nativeElement.close();
    this.draft = this.empty();
    this.original = undefined;
    this.error.set('');
  }
  search() {
    if (this.busy() || this.searching() || !this.query.trim()) return;
    this.searching.set(true);
    this.searchError.set('');
    this.searchRequest = this.http
      .get<{ districts: District[] }>(`${this.config.value.apiBaseUrl}/ubigeo/districts`, {
        params: { q: this.query.trim(), limit: 20 },
      })
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (r) => {
          if (!Array.isArray(r.districts)) {
            this.searching.set(false);
            this.searchError.set('No se pudo interpretar el catálogo. Vuelve a buscar.');
            return;
          }
          this.districts.set(r.districts);
          this.searching.set(false);
          if (!r.districts.length)
            this.searchError.set(
              'No hay coincidencias. Prueba con el nombre o código del distrito.',
            );
        },
        error: (e) => {
          this.searching.set(false);
          this.searchError.set(requestMessage(e));
        },
      });
  }
  chooseDistrict(code: string) {
    if (code === this.draft.ubigeo) return;
    this.draft.ubigeo = code;
    this.center.set(this.districts().find((d) => d.code === code)?.center ?? null);
    this.draft.latitude = null;
    this.draft.longitude = null;
  }
  mark(p: AddressPoint) {
    this.draft.latitude = p.lat;
    this.draft.longitude = p.lng;
  }
  clearPoint() {
    this.draft.latitude = null;
    this.draft.longitude = null;
  }
  save(form: NgForm) {
    if (this.busy() || form.invalid || !this.valid || (this.editing() && !this.dirty)) return;
    const normalized = this.normalize(this.draft);
    const { latitude, longitude, ...fields } = normalized;
    const body = {
      ...fields,
      ...(latitude !== null && longitude !== null
        ? { latitude, longitude }
        : this.original?.latitude != null
          ? { clear_point: true }
          : {}),
    };
    this.busy.set(true);
    this.error.set('');
    const request = this.original
      ? this.http.patch<DeliveryAddress>(
          `${this.base}/${encodeURIComponent(this.original.id)}`,
          body,
        )
      : this.http.post<DeliveryAddress>(this.base, body);
    request.pipe(timeout(20000), takeUntilDestroyed(this.destroy)).subscribe({
      next: (address) => {
        const list = this.addresses()
          .filter((a) => a.id !== address.id)
          .map((a) => (address.primary ? { ...a, primary: false } : a));
        this.changed.emit([...list, address]);
        this.busy.set(false);
        this.cancel();
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(requestMessage(e));
      },
    });
  }
  remove() {
    if (this.busy() || !this.original || !this.removing()) return;
    const id = this.original.id;
    this.busy.set(true);
    this.error.set('');
    this.http
      .delete(`${this.base}/${encodeURIComponent(id)}`)
      .pipe(timeout(20000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.changed.emit(this.addresses().filter((a) => a.id !== id));
          this.busy.set(false);
          this.cancel();
        },
        error: (e) => {
          this.busy.set(false);
          this.error.set(requestMessage(e));
        },
      });
  }
}
