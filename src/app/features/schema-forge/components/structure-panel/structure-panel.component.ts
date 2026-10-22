import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { SchemaForgeStore } from '../../services/schema-forge.store';
import { PropertyEditorComponent } from '../property-editor/property-editor.component';
import { StructureTreeComponent } from '../structure-tree/structure-tree.component';

@Component({
  selector: 'sf-structure-panel',
  imports: [
    MatIconButton,
    MatTooltip,
    IconComponent,
    StructureTreeComponent,
    PropertyEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './structure-panel.component.html',
  styleUrl: './structure-panel.component.scss',
})
export class StructurePanelComponent {
  protected readonly store = inject(SchemaForgeStore);
  protected readonly tree = viewChild(StructureTreeComponent);
  private readonly rootNameInput = viewChild<ElementRef<HTMLInputElement>>('rootNameInput');

  /** A nested model has the same name as the root model (e.g. `cliente` inside `Cliente`). */
  protected readonly rootNameConflict = computed(
    () =>
      this.store.diagnostics().find((diagnostic) => diagnostic.code === 'root-name-conflict') ??
      null,
  );

  constructor() {
    // Focus the root name when requested (e.g. from the "new document" notification).
    let handled = this.store.focusRootName();
    afterRenderEffect(() => {
      const requests = this.store.focusRootName();
      const input = this.rootNameInput()?.nativeElement;
      if (requests !== handled && input) {
        handled = requests;
        input.focus();
        input.select();
      }
    });
  }

  protected setRootName(event: Event): void {
    this.store.setRootName((event.target as HTMLInputElement).value);
  }
}
