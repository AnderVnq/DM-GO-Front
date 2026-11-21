import type { AddressRecord } from '../../shared/address.model';
export interface Customer {
  id: string;
  locker_code: string;
  name: string;
  email: string;
  phone: string;
  document: { type: 'dni' | 'ruc'; number: string; verified: boolean };
  addresses: AddressRecord[];
  locker_addresses?: {
    warehouse_code: string;
    recipient: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  }[];
  created_at: string;
}

export interface CreateCustomerInput {
  doc_type: 'dni' | 'ruc';
  doc_number: string;
  name: string;
  email: string;
  phone: string;
}

export type CustomerSort = 'newest' | 'oldest' | 'name';

export type CustomerListItem = Pick<
  Customer,
  'id' | 'locker_code' | 'name' | 'email' | 'phone' | 'document' | 'created_at'
> & { seller: { id: string; name: string } | null };

export interface CustomerListQuery {
  q: string;
  sort: CustomerSort;
  limit: number;
  offset: number;
  seller_id?: string;
}

export interface CustomerListPage {
  customers: CustomerListItem[];
  total: number;
  limit: number;
  offset: number;
}
