import { DOCUMENT, Injectable, RendererFactory2, effect, inject, signal } from '@angular/core';
import { BrowserStorageService } from './browser-storage.service';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'schemaforge.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(BrowserStorageService);
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(RendererFactory2).createRenderer(null, null);

  readonly mode = signal<ThemeMode>(this.storage.read<ThemeMode>(STORAGE_KEY) ?? 'dark');

  constructor() {
    effect(() => {
      const mode = this.mode();
      const root = this.document.documentElement;
      this.renderer.removeClass(root, mode === 'dark' ? 'theme-light' : 'theme-dark');
      this.renderer.addClass(root, `theme-${mode}`);
      this.storage.write(STORAGE_KEY, mode);
    });
  }

  toggle(): void {
    this.mode.update((mode) => (mode === 'dark' ? 'light' : 'dark'));
  }
}
