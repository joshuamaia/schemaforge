import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Diagnostic } from '../../../../core/models/diagnostic';
import { LineIndex } from '../../../../core/utils/text-position';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { SchemaForgeStore } from '../../services/schema-forge.store';

type DiagnosticTab = 'errors' | 'warnings';

interface DiagnosticRow {
  readonly diagnostic: Diagnostic;
  readonly location: string | null;
}

/** Errors and warnings of the input JSON and of the configuration, shown separately. */
@Component({
  selector: 'sf-diagnostics-list',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diagnostics-list.component.html',
  styleUrl: './diagnostics-list.component.scss',
})
export class DiagnosticsListComponent {
  protected readonly store = inject(SchemaForgeStore);
  protected readonly expanded = signal(true);
  private readonly preferredTab = signal<DiagnosticTab | null>(null);

  protected readonly tab = computed<DiagnosticTab>(() => {
    const preferred = this.preferredTab();
    if (preferred) {
      return preferred;
    }
    return this.store.errors().length > 0 || this.store.warnings().length === 0
      ? 'errors'
      : 'warnings';
  });

  private readonly lineIndex = computed(() => new LineIndex(this.store.jsonText()));

  protected readonly rows = computed<DiagnosticRow[]>(() => {
    const list = this.tab() === 'errors' ? this.store.errors() : this.store.warnings();
    const index = this.lineIndex();
    return list.map((diagnostic) => {
      const range = diagnostic.range;
      if (!range || (this.store.schemaIsStale() && diagnostic.code !== 'syntax')) {
        return { diagnostic, location: null };
      }
      const position = index.positionAt(range.start);
      return { diagnostic, location: `Ln ${position.line}, Col ${position.column}` };
    });
  });

  protected selectTab(tab: DiagnosticTab): void {
    this.preferredTab.set(tab);
    this.expanded.set(true);
  }

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }

  protected iconFor(diagnostic: Diagnostic): 'circle-x' | 'triangle-alert' | 'info' {
    if (diagnostic.severity === 'error') {
      return 'circle-x';
    }
    return diagnostic.severity === 'warning' ? 'triangle-alert' : 'info';
  }
}
