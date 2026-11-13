import { Component, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';

@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
export class App {
  constructor() {
    const meta = inject(Meta);
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const path = event.urlAfterRedirects.split(/[?#]/)[0];
        meta.updateTag({
          name: 'robots',
          content: path === '/' ? 'index, follow' : 'noindex, nofollow',
        });
      });
  }
}
