export interface DeliveryDriver {
  id: string;
  name: string;
  email: string;
  last_seen_at: string;
}
export interface RoutePackage {
  package_id: string;
  result: 'pending' | 'delivered' | 'failed';
  fail_reason?: string;
  resolved_at?: string | null;
}
export interface RouteStop {
  id: string;
  seq: number;
  status: 'pending' | 'delivered' | 'failed' | 'partial';
  kind: 'customer' | 'agency';
  agency_id?: string;
  recipient_name: string;
  recipient_phone: string;
  ubigeo: string;
  address: string;
  reference: string;
  district?: { code: string; name: string; province: string; department: string } | null;
  location?: { lat: number; lng: number; precision: 'address' | 'district' } | null;
  navigation_url?: string;
  packages: RoutePackage[];
}
export interface DeliveryRoute {
  id: string;
  code: string;
  driver_id: string;
  driver_name: string;
  date: string;
  warehouse_code: string;
  status: 'planned' | 'in_progress' | 'completed';
  stops: RouteStop[];
  started_at?: string | null;
  completed_at?: string | null;
}
export interface CreateRouteInput {
  driver_id: string;
  date: string;
  warehouse_code: string;
}
export const routeStatuses = {
  planned: 'Planificada',
  in_progress: 'En reparto',
  completed: 'Finalizada',
};
export const stopStatuses = {
  pending: 'Pendiente',
  delivered: 'Entregada',
  failed: 'No entregada',
  partial: 'Parcial',
};
export const packageResults = {
  pending: 'Pendiente',
  delivered: 'Entregado',
  failed: 'No entregado',
};
