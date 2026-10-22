import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTooltip } from '@angular/material/tooltip';
import { NotificationService } from '../../../../core/services/notification.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { MonacoEditorComponent } from '../../editors/monaco-editor.component';
import { OUTPUT_FORMAT_LABELS, OutputFormat } from '../../models/config.model';
import { ExportWorkflowService } from '../../services/export-workflow.service';
import { ExportService } from '../../services/export.service';
import { SchemaForgeStore } from '../../services/schema-forge.store';
import { activeValidationKeys } from '../../validators/validation-rules';
import { FileExplorerComponent } from '../file-explorer/file-explorer.component';
import { GenerationOptionsComponent } from '../generation-options/generation-options.component';

@Component({
  selector: 'sf-code-panel',
  imports: [
    MatIconButton,
    MatButtonToggleGroup,
    MatButtonToggle,
    MatTooltip,
    MatSlideToggle,
    IconComponent,
    MonacoEditorComponent,
    FileExplorerComponent,
    GenerationOptionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './code-panel.component.html',
  styleUrl: './code-panel.component.scss',
})
export class CodePanelComponent {
  protected readonly store = inject(SchemaForgeStore);
  private readonly exporter = inject(ExportService);
  private readonly exportWorkflow = inject(ExportWorkflowService);
  private readonly notifications = inject(NotificationService);

  protected readonly formats = Object.entries(OUTPUT_FORMAT_LABELS) as [OutputFormat, string][];
  protected readonly optionsOpen = signal(false);
  protected readonly explorerOpen = signal(true);

  /** Number of properties that have at least one validation rule configured. */
  protected readonly configuredValidations = computed(
    () =>
      Object.values(this.store.config().properties).filter(
        (settings) =>
          settings.included !== false &&
          activeValidationKeys(settings.validations ?? {}).length > 0,
      ).length,
  );

  protected readonly language = computed(() =>
    this.store.activeFile()?.language === 'typescript' ? 'typescript' : 'java',
  );

  protected async copy(): Promise<void> {
    const file = this.store.activeFile();
    if (!file) {
      return;
    }
    if (await this.exporter.copy(file.content)) {
      this.notifications.success(`${file.name} copiado para a área de transferência.`);
    } else {
      this.notifications.error('Não foi possível copiar. Verifique as permissões do navegador.');
    }
  }

  protected download(): void {
    const file = this.store.activeFile();
    if (file) {
      this.exporter.downloadFile(file);
      this.notifications.success(`${file.name} baixado.`);
    }
  }

  protected exportZip(): void {
    this.exportWorkflow.exportZip();
  }
}
