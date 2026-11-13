import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer, type ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { RuntimeConfig } from './core/runtime-config';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => {
      inject(ThemeService);
      const config = inject(RuntimeConfig);
      const auth = inject(AuthService);
      return config.load().then(() => {
        const callback = new URLSearchParams(location.hash.slice(1));
        // Procesar el retorno antes de que el router capture el fragmento OIDC.
        if (
          /^\/(?:login|portal|internal)(?:\/|$)/.test(location.pathname) &&
          callback.has('state') &&
          (callback.has('code') || callback.has('error'))
        ) {
          return auth.ensureInitialized();
        }
        return undefined;
      });
    }),
  ],
};
