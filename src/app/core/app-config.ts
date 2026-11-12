export interface AppConfig {
  apiBaseUrl: string;
  oidcUrl: string;
  oidcRealm: string;
  oidcClientId: string;
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
  return {
    apiBaseUrl: api,
    oidcUrl: String(data['oidcUrl']),
    oidcRealm: String(data['oidcRealm']),
    oidcClientId: String(data['oidcClientId']),
  };
}
