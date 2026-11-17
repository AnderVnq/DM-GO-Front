export type CustomsStatus =
  'released' | 'pending_tax' | 'proof_sent' | 'inspection' | 'unknown_guide';
export interface CustomsLine {
  id: string;
  package_id: string;
  customer_id: string;
  customs_manifest: string;
  guide: string;
  declaration: string;
  tax_cents: number;
  currency: 'USD' | 'PEN';
  channel: 'green' | 'red';
  status: CustomsStatus;
  proof_submitted: boolean;
  assessment_document_id: string;
  proof_document_id: string;
  released_at: string | null;
}
export interface CustomsImportResult {
  report_id: string;
  released: string[];
  pending_tax: string[];
  inspection: string[];
  unchanged: string[];
  updated: string[];
  conflicts: string[];
  unknown: string[];
  not_arrived: string[];
}
export type DocumentKind = 'assessment' | 'payment_proof';
export const customsStatuses: Record<CustomsStatus, string> = {
  released: 'Liberada',
  pending_tax: 'Pendiente de tributo',
  proof_sent: 'Constancia por revisar',
  inspection: 'Pendiente de inspección',
  unknown_guide: 'Guía no identificada',
};
export const importGroups: {
  key: Exclude<keyof CustomsImportResult, 'report_id'>;
  label: string;
}[] = [
  { key: 'released', label: 'Liberadas' },
  { key: 'pending_tax', label: 'Pendientes de tributo' },
  { key: 'inspection', label: 'Pendientes de inspección' },
  { key: 'unchanged', label: 'Sin cambios' },
  { key: 'updated', label: 'Actualizadas' },
  { key: 'conflicts', label: 'Conflictos con guías liberadas' },
  { key: 'unknown', label: 'Guías no identificadas' },
  { key: 'not_arrived', label: 'Sin recepción en Lima' },
];
