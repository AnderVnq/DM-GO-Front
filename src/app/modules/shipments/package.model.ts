export interface Package {
  id: string;
  customer_id: string;
  mode: string;
  status: string;
  store: string;
  carrier_tracking: string;
  description: string;
  declared_value_cents: number;
  has_invoice: boolean;
  invoice_document_id?: string;
  created_at: string;
  delivery_method?: string;
  delivery_address_id?: string;
  delivery_agency_id?: string;
  delivery_agency_branch_id?: string;
  failed_attempts?: number;
  home_delivery_allowed?: boolean;
  receipt?: {
    number: string;
    weight_g: number;
    weight_kg: string;
    received_at: string;
    dimensions_mm: number[];
  };
}
export interface TrackingResponse {
  package_id: string;
  status: string;
  events: { at: string; action: string; title: string; location?: string }[];
}
export interface PrealertInput {
  customer_id: string;
  mode: string;
  store: string;
  carrier_tracking: string;
  description: string;
  declared_value_cents: number;
}
