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
      return config.load().then(() => auth.initialize());
    }),
  ],
};
