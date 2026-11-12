export interface Customer {
  id: string;
  locker_code: string;
  name: string;
  email: string;
  phone: string;
  document: { type: 'dni' | 'ruc'; number: string; verified: boolean };
  addresses: { id: string; ubigeo: string; line: string; reference: string; primary: boolean }[];
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
