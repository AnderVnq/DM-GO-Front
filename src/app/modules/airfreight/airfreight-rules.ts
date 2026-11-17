export function normalizeMawb(value: string): string | null {
  const match = /^(\d{3})-?(\d{8})$/.exec(value.trim().replaceAll(' ', ''));
  if (!match || Number(match[2]!.slice(0, 7)) % 7 !== Number(match[2]![7])) return null;
  return `${match[1]}-${match[2]}`;
}
export function limaDeparture(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const iso = `${value}:00-05:00`;
  const time = Date.parse(iso);
  return Number.isFinite(time) &&
    new Date(time - 5 * 60 * 60 * 1000).toISOString().slice(0, 16) === value
    ? iso
    : null;
}
export function flightReference(
  value: string,
  kind: 'mawb' | 'consolidation',
  origin: string,
): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const text = value.trim();
  if (uuid.test(text)) return text;
  try {
    const url = new URL(text, origin);
    const id = url.searchParams.get(kind === 'mawb' ? 'mawb_id' : 'consolidation_id') ?? '';
    const path = kind === 'mawb' ? '/internal/airfreight' : '/internal/consolidations';
    return url.origin === origin &&
      url.pathname === path &&
      !url.username &&
      !url.password &&
      !url.hash &&
      uuid.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}
