import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { firstValueFrom } from 'rxjs';
import { RuntimeConfig } from './runtime-config';
import { canManage, isStaff, safeReturnUrl } from './access';
import { SessionExpiredError } from './session-error';

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  roles: string[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfig);
  private keycloak: Keycloak | null = null;
  private refreshing: Promise<boolean> | null = null;
  readonly user = signal<UserProfile | null>(null);
  readonly error = signal('');
  readonly staff = computed(() => isStaff(this.user()?.roles ?? []));
  readonly manager = computed(() => canManage(this.user()?.roles ?? []));

  async initialize(): Promise<void> {
    const config = this.config.value;
    this.keycloak = new Keycloak({
      url: config.oidcUrl,
      realm: config.oidcRealm,
      clientId: config.oidcClientId,
    });
    this.keycloak.onAuthLogout = () => this.clear();
    try {
      const authenticated = await this.keycloak.init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        silentCheckSsoRedirectUri: `${location.origin}/silent-check-sso.html`,
        silentCheckSsoFallback: false,
      });
      if (authenticated)
        this.user.set(await firstValueFrom(this.http.get<UserProfile>(`${config.apiBaseUrl}/me`)));
    } catch {
      this.clear();
      this.error.set('No se pudo conectar con el servicio de acceso. Verifica Keycloak y la API.');
    }
  }

  async login(returnUrl?: string): Promise<void> {
    if (!this.keycloak)
      throw new Error('El servicio de acceso no está disponible. Recarga la página.');
    await this.keycloak.login({ redirectUri: `${location.origin}${safeReturnUrl(returnUrl)}` });
  }

  async logout(): Promise<void> {
    this.user.set(null);
    await this.keycloak?.logout({ redirectUri: `${location.origin}/login` });
  }

  clear(): void {
    this.user.set(null);
    this.keycloak?.clearToken();
  }

  async validToken(): Promise<string | null> {
    const client = this.keycloak;
    if (!client?.authenticated) return null;
    if (!this.refreshing) {
      this.refreshing = client.updateToken(30).finally(() => {
        this.refreshing = null;
      });
    }
    try {
      await this.refreshing;
      return client.token ?? null;
    } catch {
      this.clear();
      throw new SessionExpiredError();
    }
  }
}
