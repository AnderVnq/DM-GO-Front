interface StopShape {
  packages: { package_id: string; result: string }[];
}
export function validRouteDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validRouteRange(from: string, to: string): boolean {
  return (
    !!(from || to) &&
    (!from || validRouteDate(from)) &&
    (!to || validRouteDate(to)) &&
    (!from || !to || from <= to)
  );
}
export function routeDayLabel(value: string): string {
  return validRouteDate(value) ? value.split('-').reverse().join('/') : '—';
}
export function canStartRoute(route: { status: string; stops: StopShape[] }): boolean {
  return route.status === 'planned' && route.stops.length > 0;
}
export function canCompleteRoute(route: { status: string; stops: StopShape[] }): boolean {
  return (
    route.status === 'in_progress' &&
    !route.stops.some((s) => s.packages.some((p) => p.result === 'pending'))
  );
}
export function validFailureSelection(
  packages: StopShape['packages'],
  ids: string[],
  reason: string,
): boolean {
  return (
    !!reason.trim() &&
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => packages.some((p) => p.package_id === id && p.result === 'pending'))
  );
}
export function todayInLima(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function routeReference(value: string, origin: string): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const raw = value.trim();
  if (uuid.test(raw)) return raw;
  try {
    const u = new URL(raw, origin),
      id = u.searchParams.get('route_id') ?? '';
    return u.origin === origin &&
      !u.username &&
      !u.password &&
      !u.hash &&
      u.pathname === '/internal/delivery-routes' &&
      uuid.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}
export function validPackageId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}
