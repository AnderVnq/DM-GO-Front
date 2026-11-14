export interface Bulk {
  id: string;
  code: string;
  warehouse_code: string;
  status: 'open' | 'closed';
  seal?: string;
  weight_g?: number;
  weight_kg?: string;
  dimensions_mm?: number[];
  package_ids: string[];
  consolidation_id?: string;
  created_at: string;
  closed_at?: string;
}
export interface BulkClosure {
  seal: string;
  weight_kg: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
}
export interface Hawb {
  id: string;
  number: string;
  customer_id: string;
  package_ids: string[];
}
export interface Consolidation {
  id: string;
  code: string;
  warehouse_code: string;
  status: 'open' | 'closed';
  bulk_ids: string[];
  hawbs: Hawb[];
  created_at: string;
  closed_at?: string;
}

export interface GuideCard {
  id: string;
  customer_id: string;
  locker_code: string;
  consignee_id?: string;
  wr?: string;
  carrier_tracking: string;
  store: string;
  description: string;
  unit_value_cents: number;
  quantity: number;
  declared_value_cents: number;
  weight_g?: number;
  weight_kg?: string;
}
export interface GuideGroup {
  id: string;
  position: number;
  customer_id: string;
  packages: GuideCard[];
  created_at: string;
}
export interface GuideBoard {
  consolidation_id: string;
  code: string;
  status: 'open' | 'closed';
  groups: GuideGroup[];
  ungrouped: GuideCard[];
}
