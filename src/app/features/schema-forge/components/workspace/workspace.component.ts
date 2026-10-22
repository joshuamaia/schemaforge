import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatTab, MatTabGroup, MatTabLabel } from '@angular/material/tabs';
import { map } from 'rxjs';
import { BrowserStorageService } from '../../../../core/services/browser-storage.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ResizeHandleComponent } from '../../../../shared/components/resize-handle/resize-handle.component';
import { SchemaForgeStore } from '../../services/schema-forge.store';
import { CodePanelComponent } from '../code-panel/code-panel.component';
import { JsonPanelComponent } from '../json-panel/json-panel.component';
import { StructurePanelComponent } from '../structure-panel/structure-panel.component';
import { DEFAULT_PANEL_SIZES, PanelSizes, isValidPanelSizes, resizePanels } from './panel-sizes';

const SIZES_KEY = 'schemaforge.panels';
export const COMPACT_LAYOUT_QUERY = '(max-width: 1023.98px)';

/** Three resizable panels on desktop; tabs on smaller screens. */
@Component({
  selector: 'sf-workspace',
  imports: [
    MatTabGroup,
    MatTab,
    MatTabLabel,
    IconComponent,
    ResizeHandleComponent,
    JsonPanelComponent,
    StructurePanelComponent,
    CodePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
})
export class WorkspaceComponent {
  protected readonly store = inject(SchemaForgeStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly storage = inject(BrowserStorageService);

  protected readonly compact = toSignal(
    inject(BreakpointObserver)
      .observe(COMPACT_LAYOUT_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly sizes = signal<PanelSizes>(this.loadSizes());
  protected readonly columns = computed(() => {
    const [a, b, c] = this.sizes();
    return `${a}fr 6px ${b}fr 6px ${c}fr`;
  });
  protected readonly selectedTab = signal(0);

  constructor() {
    effect(() => this.storage.write(SIZES_KEY, this.sizes()));

    // On small screens the root model name lives in the "Estrutura" tab.
    const initialFocusRequests = this.store.focusRootName();
    effect(() => {
      if (this.store.focusRootName() !== initialFocusRequests) {
        this.selectedTab.set(1);
      }
    });
  }

  protected resizeBy(index: 0 | 1, deltaPx: number): void {
    const width = this.host.nativeElement.clientWidth || 1;
    this.sizes.update((sizes) => resizePanels(sizes, index, (deltaPx / width) * 100));
  }

  protected stepBy(index: 0 | 1, deltaPercent: number): void {
    this.sizes.update((sizes) => resizePanels(sizes, index, deltaPercent));
  }

  protected resetSizes(): void {
    this.sizes.set(DEFAULT_PANEL_SIZES);
  }

  private loadSizes(): PanelSizes {
    const saved = this.storage.read<unknown>(SIZES_KEY);
    return isValidPanelSizes(saved) ? saved : DEFAULT_PANEL_SIZES;
  }
}
