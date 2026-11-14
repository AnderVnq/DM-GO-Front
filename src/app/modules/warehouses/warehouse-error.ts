import { requestMessage, type ApiProblem } from '../../core/api-problem';

export function warehouseError(error: unknown): string {
  const fields =
    error && typeof error === 'object' && 'error' in error
      ? (error.error as ApiProblem | null)?.errors
      : undefined;
  const labels: Record<string, string> = {
    code: 'Código',
    name: 'Nombre',
    country: 'País',
    timezone: 'Zona horaria',
    'address.line1': 'Dirección',
    'address.city': 'Ciudad',
    warehouse_code: 'Almacén',
    measurement: 'Peso y medidas',
    condition: 'Condición',
    notes: 'Observaciones',
    photo_document_ids: 'Fotografías',
    description: 'Descripción',
    carrier_tracking: 'Tracking',
  };
  const details = Object.entries(fields ?? {})
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => `${labels[key] ?? 'Datos'}: ${value}`)
    .join('. ');
  return [requestMessage(error), details].filter(Boolean).join(' · ');
}
