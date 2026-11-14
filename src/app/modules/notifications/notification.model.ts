export interface PortalNotification {
  id: string;
  kind: string;
  subject: string;
  body: string;
  link?: string;
  created_at: string;
}
export interface NotificationTarget {
  path: string;
  params: Record<string, string>;
  label: string;
}

export function notificationTarget(
  link: string | undefined,
  origin: string,
): NotificationTarget | null {
  if (!link) return null;
  try {
    const url = new URL(link, origin);
    if (url.origin !== origin || url.username || url.password || url.hash) return null;
    const match = /^\/(?:portal\/)?(packages|dispatch-notes)\/([^/]+)$/.exec(url.pathname);
    if (!match) return null;
    const id = decodeURIComponent(match[2]!);
    if (!id || /[\/\\\s]/.test(id)) return null;
    return match[1] === 'packages'
      ? { path: '/portal/packages', params: { package_id: id }, label: 'Ver paquete' }
      : { path: '/portal/payments', params: { note_id: id }, label: 'Ver nota de salida' };
  } catch {
    return null;
  }
}
