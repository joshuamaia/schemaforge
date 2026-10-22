import { Injectable, inject } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import { ExportService } from './export.service';
import { SchemaForgeStore } from './schema-forge.store';

/**
 * ZIP export used by the header and the code panel. When some property types are still
 * undefined, the user is warned first and can define them or export anyway.
 */
@Injectable({ providedIn: 'root' })
export class ExportWorkflowService {
  private readonly store = inject(SchemaForgeStore);
  private readonly exporter = inject(ExportService);
  private readonly notifications = inject(NotificationService);

  exportZip(): void {
    const undefinedTypes = this.store.undefinedTypeProperties();
    if (undefinedTypes.length === 0) {
      this.download();
      return;
    }
    const first = undefinedTypes[0];
    const fallback = this.store.format() === 'typescript' ? 'unknown' : 'Object';
    const count = undefinedTypes.length;
    this.store.openTypeDefinition(first.id);
    this.notifications.withAction(
      `${count} campo${count > 1 ? 's' : ''} sem tipo definido (ex.: "${first.jsonName}") ` +
        `${count > 1 ? 'serão gerados' : 'será gerado'} como ${fallback}. Defina o tipo ou exporte assim.`,
      'Exportar assim',
      () => this.download(),
    );
  }

  private download(): void {
    const count = this.exporter.downloadZip(this.store.files());
    if (count === 0) {
      this.notifications.error('Não há arquivos gerados para exportar.');
    } else {
      this.notifications.success(`ZIP exportado com ${count} arquivo${count > 1 ? 's' : ''}.`);
    }
  }
}
