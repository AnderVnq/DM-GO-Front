import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PortalApi, type DeliveryAddress } from '../portal';
import { PortalShipmentsApi, type Package } from '../shipments';
import { requestCode, requestMessage } from '../../core/api-problem';
import { Status } from '../../shared/status';
import { PortalDeliveryApi } from './portal-delivery-api';
import {
  deliveryLocked,
  deliveryMethods,
  type DeliveryAgency,
  type DeliveryMethod,
  type DeliveryPreference,
} from './delivery.model';

@Component({
  selector: 'app-portal-delivery-page',
  imports: [FormsModule, Status],
  templateUrl: './portal-delivery-page.html',
})
export class PortalDeliveryPage {
  private readonly api = inject(PortalDeliveryApi);
  private readonly shipments = inject(PortalShipmentsApi);
  private readonly portal = inject(PortalApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly packages = signal<Package[]>([]);
  readonly addresses = signal<DeliveryAddress[]>([]);
  readonly agencies = signal<DeliveryAgency[]>([]);
  readonly selected = signal<Package | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly methods = deliveryMethods;
  readonly locked = deliveryLocked;
  preference: DeliveryPreference = {
    method: 'pickup',
    address_id: '',
    agency_id: '',
    branch_id: '',
  };
  get needsAddress() {
    return ['home', 'agency_home'].includes(this.preference.method);
  }
  get needsAgency() {
    return this.preference.method.startsWith('agency_');
  }
  get branches() {
    return this.agencies().find((a) => a.id === this.preference.agency_id)?.branches ?? [];
  }
  get exhausted() {
    return (this.selected()?.failed_attempts ?? 0) >= 2;
  }
  get valid() {
    const item = this.selected();
    return (
      !!item &&
      !this.locked(item.status) &&
      (!this.exhausted || this.preference.method === 'pickup') &&
      (!this.needsAddress || this.addresses().some((a) => a.id === this.preference.address_id)) &&
      (!this.needsAgency || this.agencies().some((a) => a.id === this.preference.agency_id)) &&
      (this.preference.method !== 'agency_pickup' ||
        this.branches.some((b) => b.id === this.preference.branch_id))
    );
  }
  constructor() {
    this.reload();
  }
  reload() {
    if (this.busy() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.success.set('');
    this.selected.set(null);
    this.packages.set([]);
    this.addresses.set([]);
    this.agencies.set([]);
    forkJoin({
      profile: this.portal.me(),
      packages: this.shipments.list(),
      agencies: this.api.agencies(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.addresses.set(data.profile.addresses ?? []);
          this.packages.set(data.packages);
          this.agencies.set(data.agencies);
          this.loading.set(false);
          const id = this.route.snapshot.queryParamMap.get('package_id');
          const item = data.packages.find((p) => p.id === id) ?? data.packages[0];
          if (item) this.select(item.id);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.fail(error);
        },
      });
  }
  select(id: string) {
    if (this.busy()) return;
    const item = this.packages().find((p) => p.id === id) ?? null;
    this.selected.set(item);
    this.error.set('');
    this.success.set('');
    const method = this.methods.find((m) => m.value === item?.delivery_method)?.value ?? 'pickup';
    this.preference = {
      method,
      address_id: item?.delivery_address_id ?? '',
      agency_id: item?.delivery_agency_id ?? '',
      branch_id: item?.delivery_agency_branch_id ?? '',
    };
    if (item)
      void this.router.navigate([], { queryParams: { package_id: item.id }, replaceUrl: true });
  }
  changeMethod(method: DeliveryMethod) {
    this.preference = { method, address_id: '', agency_id: '', branch_id: '' };
    this.success.set('');
  }
  changeAgency(id: string) {
    this.preference.agency_id = id;
    this.preference.branch_id = '';
    this.success.set('');
  }
  save() {
    const item = this.selected();
    if (!item || !this.valid || this.busy() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    this.api
      .save(item.id, { ...this.preference })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.packages.update((items) => items.map((p) => (p.id === updated.id ? updated : p)));
          this.busy.set(false);
          this.select(updated.id);
          this.success.set('Preferencia de entrega guardada.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.fail(error);
        },
      });
  }
  private fail(error: unknown) {
    if (requestCode(error) === 'onboarding_required') void this.router.navigate(['/portal']);
    else this.error.set(requestMessage(error));
  }
}
