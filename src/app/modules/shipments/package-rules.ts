export function canAttachInvoice(status: string): boolean {
  return status === 'PREALERTED' || status === 'RECEIVED_USA';
}

export function prealertTotal(cents: number | null, quantity: number): number | null {
  if (
    cents === null ||
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 999
  )
    return null;
  const total = cents * quantity;
  return Number.isSafeInteger(total) && total <= 10_000_000 ? total : null;
}

export function normalizeTracking(value: string): string | null {
  return /^[a-z0-9-]{6,40}$/i.test(value) ? value.toUpperCase() : null;
}
