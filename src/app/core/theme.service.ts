import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

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
  private animationTimer?: number;

  constructor() {
    this.preferred = this.readPreference();
    this.apply(this.preferred ?? this.systemMode());
    const onSystemChange = () => {
      if (!this.preferred) this.apply(this.systemMode());
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      this.preferred = this.readPreference();
      this.apply(this.preferred ?? this.systemMode());
    };
    this.media?.addEventListener('change', onSystemChange);
    this.window?.addEventListener('storage', onStorageChange);
    inject(DestroyRef).onDestroy(() => {
      this.window?.clearTimeout(this.animationTimer);
      this.document.documentElement.classList.remove('theme-changing');
      this.media?.removeEventListener('change', onSystemChange);
      this.window?.removeEventListener('storage', onStorageChange);
    });
  }

  toggle() {
    this.preferred = this.mode() === 'dark' ? 'light' : 'dark';
    this.window?.clearTimeout(this.animationTimer);
    const root = this.document.documentElement;
    if (this.window && !this.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-changing');
      this.animationTimer = this.window.setTimeout(
        () => root.classList.remove('theme-changing'),
        240,
      );
    } else {
      root.classList.remove('theme-changing');
    }
    this.apply(this.preferred);
    try {
      this.window?.localStorage.setItem(storageKey, this.preferred);
    } catch {
      // Conservar la elección en memoria cuando no se permite almacenamiento local.
    }
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
