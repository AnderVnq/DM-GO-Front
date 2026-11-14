export function lotReference(
  value: string,
  kind: 'bulks' | 'consolidations',
  origin: string,
): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const text = value.trim();
  if (uuid.test(text)) return text;
  try {
    const url = new URL(text, origin);
    const key = kind === 'bulks' ? 'bulk_id' : 'consolidation_id';
    const id = url.searchParams.get(key) ?? '';
    return url.origin === origin &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname === `/internal/${kind}` &&
      uuid.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}
