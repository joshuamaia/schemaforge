import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { SchemaForgeStore } from '../../services/schema-forge.store';

@Component({
  selector: 'sf-status-bar',
  imports: [IconComponent, MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let status = store.status();
    <footer class="status" role="status" aria-live="polite">
      <span class="item state" [class]="'item state state--' + status.state">
        <span class="dot" aria-hidden="true"></span>
        {{ status.label }}
      </span>
      <span class="item" matTooltip="Propriedades identificadas em todos os modelos">
        <sf-icon name="list-tree" [size]="12" />
        {{ status.properties }} propriedades
      </span>
      <span class="item" matTooltip="Objetos (modelos) identificados">
        <sf-icon name="braces" [size]="12" />
        {{ status.objects }} objetos
      </span>
      <span class="item" matTooltip="Arquivos gerados para o formato atual">
        <sf-icon name="file-code" [size]="12" />
        {{ status.files }} arquivos
      </span>
      <span class="spacer"></span>
      <span class="item language" matTooltip="Linguagem de saída">
        <sf-icon name="sparkles" [size]="12" />
        {{ status.language }}
      </span>
      <span class="item local">Processamento 100% local</span>
    </footer>
  `,
  styles: `
    .status {
      display: flex;
      align-items: center;
      gap: 2px;
      height: var(--sf-status-height);
      padding: 0 8px;
      overflow: hidden;
      border-top: 1px solid var(--sf-border);
      background: var(--sf-surface);
      color: var(--sf-muted);
      font-size: 11.5px;
      white-space: nowrap;
    }
    .item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0 8px;
    }
    .spacer {
      flex: 1;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sf-muted);
    }
    .state {
      color: var(--sf-text);
      font-weight: 600;
    }
    .state--valid .dot {
      background: var(--sf-success);
      box-shadow: 0 0 0 3px var(--sf-success-soft);
    }
    .state--warning .dot {
      background: var(--sf-warning);
      box-shadow: 0 0 0 3px var(--sf-warning-soft);
    }
    .state--invalid {
      color: var(--sf-error);
    }
    .state--invalid .dot {
      background: var(--sf-error);
      box-shadow: 0 0 0 3px var(--sf-error-soft);
    }
    .state--analyzing .dot {
      background: var(--sf-accent);
      animation: pulse 900ms ease-in-out infinite alternate;
    }
    .language {
      color: var(--sf-accent);
      font-weight: 600;
    }
    @keyframes pulse {
      to {
        opacity: 0.3;
      }
    }
    @media (max-width: 720px) {
      .local {
        display: none;
      }
    }
    @media (max-width: 520px) {
      .item:not(.state):not(.language) {
        display: none;
      }
    }
  `,
})
export class StatusBarComponent {
  protected readonly store = inject(SchemaForgeStore);
}
