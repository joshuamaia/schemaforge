import { Injectable } from '@angular/core';

/** `localStorage` access that never throws (private mode, quotas, disabled storage). */
@Injectable({ providedIn: 'root' })
export class BrowserStorageService {
  read<T>(key: string): T | null {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  write(key: string, value: unknown): void {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is a convenience only.
    }
  }

  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Persistence is a convenience only.
    }
  }
}
