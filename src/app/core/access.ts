export function isDriver(roles: readonly string[]): boolean {
  return roles.includes('driver');
}

export function isAdmin(roles: readonly string[]): boolean {
  return roles.includes('admin');
}

export function isStaff(roles: readonly string[]): boolean {
  return roles.some((role) => ['admin', 'supervisor', 'seller'].includes(role));
}

/** El panel comercial y la elegibilidad del portal tienen permisos distintos. */
export function isPortalUser(roles: readonly string[]): boolean {
  return !roles.some((role) => ['admin', 'supervisor', 'seller', 'driver'].includes(role));
}

export function canManage(roles: readonly string[]): boolean {
  return roles.some((role) => ['admin', 'supervisor'].includes(role));
}

export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || /[\\%\r\n]/.test(value)) return '/internal/overview';
  return /^(?:\/(?:internal|portal)(?:\/|\?|$)|\/driver(?:\?|$))/.test(value)
    ? value
    : '/internal/overview';
}

export function isApiRequest(url: string, base: string, origin: string): boolean {
  try {
    const request = new URL(url, origin);
    const api = new URL(base, origin);
    const path = api.pathname.replace(/\/$/, '');
    return (
      request.origin === api.origin &&
      (request.pathname === path || request.pathname.startsWith(`${path}/`))
    );
  } catch {
    return false;
  }
}
