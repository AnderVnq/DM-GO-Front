export function canRelease(line: {
  status: string;
  tax_cents: number;
  proof_document_id: string;
}): boolean {
  return (
    ['pending_tax', 'proof_sent', 'inspection'].includes(line.status) &&
    Number.isSafeInteger(line.tax_cents) &&
    line.tax_cents >= 0 &&
    (line.tax_cents === 0 || !!line.proof_document_id)
  );
}
export function validManifest(value: string): boolean {
  const text = value.trim();
  return !!text && new TextEncoder().encode(text).length <= 50;
}
export function reportFileError(file: { name: string; size: number }): string {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return 'Selecciona un archivo CSV o XLSX.';
  if (!file.size) return 'El reporte está vacío.';
  return file.size > 5 * 1024 * 1024 ? 'El reporte supera el máximo de 5 MB.' : '';
}
export function customsMoney(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || !['USD', 'PEN'].includes(currency)) return '—';
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(cents / 100);
}
export function customsReference(value: string, origin: string): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const raw = value.trim();
  if (uuid.test(raw)) return raw;
  try {
    const url = new URL(raw, origin);
    const id = url.searchParams.get('line_id') ?? '';
    return url.origin === origin &&
      !url.username &&
      !url.password &&
      url.pathname === '/internal/customs' &&
      !url.hash &&
      uuid.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}
