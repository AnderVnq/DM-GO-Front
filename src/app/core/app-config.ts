export interface AppConfig {
  apiBaseUrl: string;
  oidcUrl: string;
  oidcRealm: string;
  oidcClientId: string;
  documentProxyOrigin?: string;
}

export function validateAppConfig(value: unknown): AppConfig {
  if (!value || typeof value !== 'object') throw new Error('La configuración no es válida.');
  const data = value as Record<string, unknown>;
  for (const key of ['apiBaseUrl', 'oidcUrl', 'oidcRealm', 'oidcClientId']) {
    if (typeof data[key] !== 'string' || !(data[key] as string).trim()) {
      throw new Error(`Falta ${key} en la configuración de la aplicación.`);
    }
  }
  const api = String(data['apiBaseUrl']).replace(/\/$/, '');
  if (!/^(\/[^/]|https?:\/\/)/.test(api) || !/^https?:\/\//.test(String(data['oidcUrl']))) {
    throw new Error('Las URLs de la configuración no son válidas.');
  }
  let documentProxyOrigin: string | undefined;
  if (data['documentProxyOrigin'] !== undefined) {
    try {
      const url = new URL(String(data['documentProxyOrigin']));
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== data['documentProxyOrigin'])
        throw new Error();
      documentProxyOrigin = url.origin;
    } catch {
      throw new Error('El origen del proxy de documentos no es válido.');
    }
  }
  return {
    ...(documentProxyOrigin ? { documentProxyOrigin } : {}),
    apiBaseUrl: api,
    oidcUrl: String(data['oidcUrl']),
    oidcRealm: String(data['oidcRealm']),
    oidcClientId: String(data['oidcClientId']),
  };
}
