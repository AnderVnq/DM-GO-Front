import type { Package } from '../shipments';
export interface ReceiveInput {
  warehouse_code: string;
  carrier_tracking: string;
  locker_code: string;
  description: string;
  weight_g: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  condition: 'good' | 'damaged' | 'opened';
  notes: string;
  photo_document_ids: string[];
}
export interface ReceiveResult {
  matched_by: 'tracking' | 'locker' | 'unidentified';
  package: Package;
}
export function emptyReceipt(): ReceiveInput {
  return {
    warehouse_code: '',
    carrier_tracking: '',
    locker_code: '',
    description: '',
    weight_g: 0,
    length_mm: 0,
    width_mm: 0,
    height_mm: 0,
    condition: 'good',
    notes: '',
    photo_document_ids: [],
  };
}
