export interface PortalProfile {
  id: string;
  locker_code: string;
  name: string;
  email: string;
  phone: string;
  document: { type: 'dni' | 'ruc'; number: string; verified: boolean };
  locker_addresses?: LockerAddress[];
}
export interface LockerAddress {
  warehouse_code: string;
  recipient: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}
export interface OnboardingInput {
  doc_type: 'dni' | 'ruc';
  doc_number: string;
  name: string;
  phone: string;
}
export interface LinkRequest {
  id: string;
  status: string;
  reason?: string;
  created_at: string;
}
