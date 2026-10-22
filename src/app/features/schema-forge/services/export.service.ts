import { DOCUMENT, Injectable, inject } from '@angular/core';
import { createZip } from '../../../core/utils/zip';
import { GeneratedFile } from '../models/generated-file.model';

const MIME_TYPES: Readonly<Record<GeneratedFile['language'], string>> = {
  java: 'text/x-java-source;charset=utf-8',
  typescript: 'application/typescript;charset=utf-8',
};

export const ZIP_FILE_NAME = 'schemaforge-generated.zip';

/** Builds the export entries, skipping empty files. Paths keep packages and folders. */
export function exportEntries(
  files: readonly GeneratedFile[],
): { path: string; content: string }[] {
  return files
    .filter((file) => file.content.trim().length > 0)
    .map((file) => ({ path: `generated/${file.path}`, content: file.content }));
}

/** Clipboard and download helpers using native browser APIs only. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly document = inject(DOCUMENT);

  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  downloadFile(file: GeneratedFile): void {
    this.save(new Blob([file.content], { type: MIME_TYPES[file.language] }), file.name);
  }

  /** Downloads all files as a ZIP built locally. Returns the number of exported files. */
  downloadZip(files: readonly GeneratedFile[]): number {
    const entries = exportEntries(files);
    if (entries.length === 0) {
      return 0;
    }
    const zip = createZip(entries);
    this.save(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), ZIP_FILE_NAME);
    return entries.length;
  }

  private save(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
