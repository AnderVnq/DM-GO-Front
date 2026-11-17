export function validPieces(value: number, replace: boolean): boolean {
  return Number.isSafeInteger(value) && value >= (replace ? 0 : 1) && value <= 999;
}
export function normalizeScanCode(value: string): string {
  return value.trim().toUpperCase();
}
export function validScanCode(value: string): boolean {
  const code = normalizeScanCode(value);
  return code.length > 0 && new TextEncoder().encode(code).length <= 40;
}
export function receptionReference(
  value: string,
  kind: 'reception' | 'mawb',
  origin: string,
): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const text = value.trim();
  if (uuid.test(text)) return text;
  try {
    const url = new URL(text, origin);
    const id = url.searchParams.get(kind === 'reception' ? 'reception_id' : 'mawb_id') ?? '';
    return url.origin === origin &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname === `/internal/${kind === 'reception' ? 'receptions' : 'airfreight'}` &&
      uuid.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}
