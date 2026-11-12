export function paymentIssue(balance: number, amount: number | null): string | null {
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0)
    return 'Indica un importe positivo con hasta dos decimales.';
  if (!Number.isSafeInteger(balance) || amount > balance)
    return 'El pago no puede superar el saldo pendiente.';
  return null;
}
export function canEditNote(status: string): boolean {
  return status === 'draft';
}
export function canCancelNote(status: string, paidCents: number): boolean {
  return ['draft', 'pending_payment'].includes(status) && paidCents === 0;
}
