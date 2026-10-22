import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { NotificationService } from '../../../../core/services/notification.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ExportWorkflowService } from '../../services/export-workflow.service';
import { SchemaForgeStore } from '../../services/schema-forge.store';

@Component({
  selector: 'sf-app-header',
  imports: [MatButton, MatIconButton, MatTooltip, MatProgressBar, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
})
export class AppHeaderComponent {
  protected readonly store = inject(SchemaForgeStore);
  protected readonly theme = inject(ThemeService);
  private readonly exportWorkflow = inject(ExportWorkflowService);
  private readonly notifications = inject(NotificationService);

  protected clearProject(): void {
    const previousJson = this.store.jsonText();
    const previousConfig = this.store.config();
    this.store.clearProject();
    this.notifications.withAction('Projeto limpo.', 'Desfazer', () => {
      this.store.config.set(previousConfig);
      this.store.setJson(previousJson);
    });
  }

  protected exportZip(): void {
    this.exportWorkflow.exportZip();
  }
}
