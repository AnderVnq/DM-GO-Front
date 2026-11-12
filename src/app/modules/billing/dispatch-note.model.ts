export interface NoteGuide {
  package_id: string;
  guide_number: string;
  wr: string;
  billable_grams: number;
}
export interface NoteLine {
  id: string;
  package_id?: string;
  charge_code: string;
  charge_name: string;
  calc: string;
  rate_cents: number | null;
  quantity: number;
  amount_cents: number;
  applies: boolean;
  manual: boolean;
}
export interface NotePayment {
  id: string;
  method: string;
  origin: string;
  reference?: string;
  amount_cents: number;
  paid_at: string;
  status: string;
  reject_reason?: string;
}
export interface DispatchNote {
  id: string;
  number: string;
  customer_id: string;
  status: string;
  method: string;
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
  currency: string;
  guides: NoteGuide[];
  lines: NoteLine[];
  payments: NotePayment[];
  created_at: string;
  liquidation_number?: string;
  cancel_reason?: string;
}
export interface Destination {
  method: string;
  address_id?: string;
  agency_id?: string;
  branch_id?: string;
}
export interface CreateNoteInput extends Destination {
  customer_id: string;
  package_ids: string[];
}
export interface PaymentInput {
  method: string;
  origin: string;
  reference: string;
  amount_cents: number;
  evidence_document_id?: string;
}
export interface ChargeType {
  code: string;
  name: string;
  calc: string;
  active: boolean;
  default_cents: number | null;
}
export interface Agency {
  id: string;
  name: string;
  active: boolean;
  branches: { id: string; name: string; active: boolean }[];
}
