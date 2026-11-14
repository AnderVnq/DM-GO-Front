/** Mantiene el texto decimal: nunca convierte la entrada a coma flotante. */
export function normalizeWeightKg(input: string): string | null {
  const value = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const milli = BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return milli >= 1n && milli <= 500000n ? value : null;
}

export const weightKgHint = 'Indica un peso entre 0.001 y 500 kg, con hasta 3 decimales.';

export function formatMeasuredWeight(
  value: { weight_kg?: string; weight_g?: number } | undefined,
): string {
  if (value?.weight_kg !== undefined) return `${value.weight_kg} kg`;
  if (value?.weight_g === undefined) return '—';
  return `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(value.weight_g / 1000)} kg`;
}
