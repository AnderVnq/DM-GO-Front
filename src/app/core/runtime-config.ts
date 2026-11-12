import { Injectable } from '@angular/core';
import { validateAppConfig, type AppConfig } from './app-config';

@Injectable({ providedIn: 'root' })
export class RuntimeConfig {
  private config: AppConfig | null = null;

  get value(): AppConfig {
    if (!this.config) throw new Error('La configuración todavía no está disponible.');
    return this.config;
  }

  async load(): Promise<void> {
    const response = await fetch('/app-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar la configuración de DM48.');
    this.config = validateAppConfig(await response.json());
  }
}
