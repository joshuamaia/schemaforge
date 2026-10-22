import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { NotificationService } from '../../../../core/services/notification.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { EditorMarker, MonacoEditorComponent } from '../../editors/monaco-editor.component';
import { JsonExample } from '../../models/examples';
import { JsonAnalysisService } from '../../services/json-analysis.service';
import { SchemaForgeStore } from '../../services/schema-forge.store';
import { DiagnosticsListComponent } from '../diagnostics-list/diagnostics-list.component';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

@Component({
  selector: 'sf-json-panel',
  imports: [
    MatIconButton,
    MatTooltip,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    IconComponent,
    MonacoEditorComponent,
    DiagnosticsListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './json-panel.component.html',
  styleUrl: './json-panel.component.scss',
})
export class JsonPanelComponent {
  protected readonly store = inject(SchemaForgeStore);
  private readonly notifications = inject(NotificationService);
  private readonly analysis = inject(JsonAnalysisService);

  protected readonly markers = computed<EditorMarker[]>(() =>
    this.store
      .inputDiagnostics()
      .filter((diagnostic) => diagnostic.range)
      .map((diagnostic) => ({
        severity: diagnostic.severity,
        message: diagnostic.message,
        range: diagnostic.range as NonNullable<typeof diagnostic.range>,
      })),
  );

  /** Pretty prints pasted JSON when the whole document is valid. */
  protected async onPaste(text: string): Promise<void> {
    const formatted = await this.analysis.format(text);
    // Skip if the user kept typing while a large document was being formatted.
    if (formatted !== null && formatted !== text && this.store.jsonText() === text) {
      this.store.setJson(formatted);
    }
  }

  protected async format(): Promise<void> {
    if (!this.store.jsonText().trim()) {
      return;
    }
    if (await this.store.formatJson()) {
      this.notifications.success('JSON formatado.');
    } else {
      this.notifications.error('Corrija os erros de sintaxe antes de formatar.');
    }
  }

  protected loadExample(example: JsonExample): void {
    this.store.loadExample(example);
  }

  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.notifications.error('O arquivo excede o limite de 20 MB.');
      return;
    }
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      this.store.importJson(file.name, (await this.analysis.format(text)) ?? text);
      this.notifications.success(`Arquivo "${file.name}" importado.`);
    } catch {
      this.notifications.error('Não foi possível ler o arquivo selecionado.');
    }
  }
}
