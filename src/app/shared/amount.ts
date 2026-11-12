export function parseAmountToCents(input: string): number | null {
  const value = input.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) return '—';
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function formatWeight(grams: number): string {
  return `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(grams / 1000)} kg`;
}

export function formatDate(value: string | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(value));
}
