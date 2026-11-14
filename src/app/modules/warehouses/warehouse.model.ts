export interface WarehouseAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
}
export interface WarehouseInput {
  code: string;
  name: string;
  country: string;
  address: WarehouseAddress;
  timezone: string;
}
export interface Warehouse extends WarehouseInput {
  id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
export type WarehousePatch = Pick<Warehouse, 'name' | 'address' | 'timezone' | 'active'>;
export function emptyWarehouse(): WarehouseInput {
  return {
    code: '',
    name: '',
    country: 'US',
    address: { line1: '', line2: '', city: '', state: '', postal_code: '' },
    timezone: 'America/New_York',
  };
}
