import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Injector, afterNextRender, inject, signal } from '@angular/core';

type ThemeMode = 'light' | 'dark';
const storageKey = 'dm48-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly current = signal<ThemeMode>('light');
  readonly mode = this.current.asReadonly();
  private preferred: ThemeMode | null = null;
  private readonly injector = inject(Injector);
  private transition?: ViewTransition;
  private transitionRequest = 0;

  constructor() {
    this.preferred = this.readPreference();
    this.apply(this.preferred ?? this.systemMode());
    const onSystemChange = () => {
      if (!this.preferred) this.apply(this.systemMode());
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      this.stopTransition();
      this.preferred = this.readPreference();
      this.apply(this.preferred ?? this.systemMode());
    };
    this.media?.addEventListener('change', onSystemChange);
    this.window?.addEventListener('storage', onStorageChange);
    inject(DestroyRef).onDestroy(() => {
      this.stopTransition();
      this.media?.removeEventListener('change', onSystemChange);
      this.window?.removeEventListener('storage', onStorageChange);
    });
  }

  toggle() {
    const mode = (this.preferred ?? this.mode()) === 'dark' ? 'light' : 'dark';
    this.preferred = mode;
    this.stopTransition();
    if (
      typeof this.document.startViewTransition === 'function' &&
      !this.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      const request = this.transitionRequest;
      try {
        const transition = this.document.startViewTransition(() => {
          if (request !== this.transitionRequest) return;
          this.apply(mode);
          return new Promise<void>((resolve) => {
            afterNextRender(() => resolve(), { injector: this.injector });
          });
        });
        this.transition = transition;
        void transition.ready.catch(() => {});
        void transition.finished
          .catch(() => {
            if (request === this.transitionRequest) this.apply(mode);
          })
          .finally(() => {
            if (this.transition === transition) this.transition = undefined;
          });
      } catch {
        this.apply(mode);
      }
    } else this.apply(mode);
    try {
      this.window?.localStorage.setItem(storageKey, this.preferred);
    } catch {
      // Conservar la elección en memoria cuando no se permite almacenamiento local.
    }
  }

  private stopTransition() {
    this.transitionRequest++;
    this.transition?.skipTransition();
    this.transition = undefined;
  }

  private readPreference(): ThemeMode | null {
    try {
      const value = this.window?.localStorage.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private systemMode(): ThemeMode {
    return this.media?.matches ? 'dark' : 'light';
  }

  private apply(mode: ThemeMode) {
    this.current.set(mode);
    this.document.documentElement.dataset['theme'] = mode;
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', mode === 'dark' ? '#0b1120' : '#f8fafc');
  }
}
