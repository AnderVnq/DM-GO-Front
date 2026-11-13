export function canAttachInvoice(status: string): boolean {
  return status === 'PREALERTED' || status === 'RECEIVED_USA';
}

export function declaredValueIssue(cents: number | null): string | null {
  return cents === null || !Number.isSafeInteger(cents) || cents <= 0 || cents > 10_000_000
    ? 'Indica un valor declarado mayor que cero y de hasta USD 100 000, con un máximo de dos decimales.'
    : null;
}
