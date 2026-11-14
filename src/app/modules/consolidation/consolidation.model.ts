export interface Bulk {
  id: string;
  code: string;
  warehouse_code: string;
  status: 'open' | 'closed';
  seal?: string;
  weight_g?: number;
  dimensions_mm?: number[];
  package_ids: string[];
  consolidation_id?: string;
  created_at: string;
  closed_at?: string;
}
export interface BulkClosure {
  seal: string;
  weight_g: number;
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
