import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch(() => {
  const root = document.querySelector('app-root');
  if (root)
    root.textContent =
      'No se pudo iniciar DM48. Comprueba app-config.json y vuelve a cargar la página.';
});
