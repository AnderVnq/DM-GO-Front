export interface Mawb {
  id: string;
  number: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_at: string;
  status: 'open' | 'closed';
  consolidation_ids: string[] | null;
  dispatched_at?: string;
}
export interface MawbInput {
  number: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_at: string;
}
export interface ManifestRow {
  hawb: string;
  customer_name: string;
  customer_doc_type: string;
  customer_doc_number: string;
  packages: number;
  weight_g: number;
  weight_kg: string;
  real_lb: number;
  volumetric_lb: number;
  billable_lb: number;
  billable_kg: string;
  declared_value_cents: number;
  descriptions: string[] | null;
}
export interface Manifest {
  consolidation: string;
  mawb: string;
  rows: ManifestRow[];
  totals: Omit<
    ManifestRow,
    'hawb' | 'customer_name' | 'customer_doc_type' | 'customer_doc_number' | 'descriptions'
  > & { hawbs: number };
}
export interface FlightConsolidation {
  id: string;
  code: string;
  status: 'open' | 'closed';
  warehouse_code: string;
}
export interface DispatchResult {
  mawb: Mawb;
  packages_in_transit: number;
}
