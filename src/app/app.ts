import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from './core/services/theme.service';
import { AppHeaderComponent } from './features/schema-forge/components/app-header/app-header.component';
import { StatusBarComponent } from './features/schema-forge/components/status-bar/status-bar.component';
import { WorkspaceComponent } from './features/schema-forge/components/workspace/workspace.component';

@Component({
  selector: 'app-root',
  imports: [AppHeaderComponent, WorkspaceComponent, StatusBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sf-app-header />
    <main class="workspace" aria-label="Área de trabalho">
      <sf-workspace />
    </main>
    <sf-status-bar />
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: var(--sf-header-height) minmax(0, 1fr) var(--sf-status-height);
      height: 100dvh;
    }
    .workspace {
      display: grid;
      min-height: 0;
      > sf-workspace {
        min-height: 0;
      }
    }
  `,
})
export class App {
  // Applies the persisted theme as soon as the application starts.
  protected readonly theme = inject(ThemeService);
}
