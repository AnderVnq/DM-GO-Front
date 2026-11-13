export function isStaff(roles: readonly string[]): boolean {
  return roles.some((role) => ['admin', 'supervisor', 'seller'].includes(role));
}

export function canManage(roles: readonly string[]): boolean {
  return roles.some((role) => ['admin', 'supervisor'].includes(role));
}

export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || /[\\%\r\n]/.test(value)) return '/internal/overview';
  return /^\/(?:internal|portal)(?:\/|\?|$)/.test(value) ? value : '/internal/overview';
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
