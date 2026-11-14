export type DeliveryMethod = 'pickup' | 'home' | 'agency_pickup' | 'agency_home';
export interface DeliveryPreference {
  method: DeliveryMethod;
  address_id: string;
  agency_id: string;
  branch_id: string;
}
export interface DeliveryAgency {
  id: string;
  name: string;
  branches: { id: string; name: string; ubigeo: string; address: string }[];
}
export const deliveryMethods: { value: DeliveryMethod; label: string }[] = [
  { value: 'pickup', label: 'Recojo en oficina' },
  { value: 'home', label: 'Entrega a domicilio' },
  { value: 'agency_pickup', label: 'Recojo en agencia' },
  { value: 'agency_home', label: 'Agencia a domicilio' },
];
export function deliveryLocked(status: string): boolean {
  return ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'ABANDONED', 'SPLIT'].includes(status);
}
