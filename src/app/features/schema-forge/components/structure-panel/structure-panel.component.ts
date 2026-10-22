import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
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

  protected setRootName(event: Event): void {
    this.store.setRootName((event.target as HTMLInputElement).value);
  }
}
