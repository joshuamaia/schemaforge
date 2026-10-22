import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import { DiagnosticSeverity } from '../../../../core/models/diagnostic';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { applyTypeOverride, isTypeDefined } from '../../generators/schema-resolver';
import { SchemaProperty } from '../../models/schema.model';
import { SchemaForgeStore } from '../../services/schema-forge.store';
import { activeValidationKeys } from '../../validators/validation-rules';
import { TypeTone, typeLabel, typeTone } from '../structure-panel/type-label';

export interface TreeRow {
  readonly property: SchemaProperty;
  readonly domId: string;
  readonly depth: number;
  readonly parentId: string | null;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly typeLabel: string;
  readonly tone: TypeTone;
  readonly customType: string | null;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly included: boolean;
  readonly validationCount: number;
  readonly issue: DiagnosticSeverity | null;
  readonly isArray: boolean;
  /** The type could not be inferred and was not defined by the user. */
  readonly typeUndefined: boolean;
}

/**
 * Hierarchical view of the inferred structure, rendered as a flat list of visible rows so the
 * whole tree is keyboard navigable through `aria-activedescendant`.
 */
@Component({
  selector: 'sf-structure-tree',
  imports: [IconComponent, MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './structure-tree.component.html',
  styleUrl: './structure-tree.component.scss',
})
export class StructureTreeComponent {
  protected readonly store = inject(SchemaForgeStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  private readonly activeId = signal<string | null>(null);

  protected readonly rows = computed<TreeRow[]>(() => {
    const schema = this.store.schema();
    if (!schema?.rootModelId) {
      return [];
    }
    const config = this.store.config();
    const javaOutput = config.format !== 'typescript';
    const collapsed = this.collapsed();
    const diagnostics = this.store.diagnosticsByProperty();
    const nameOf = (id: string): string | null => this.store.modelName(id) ?? null;
    const rows: TreeRow[] = [];

    const visit = (
      modelId: string,
      depth: number,
      parentId: string | null,
      excluded: boolean,
    ): void => {
      const model = this.store.modelsById().get(modelId);
      for (const property of model?.properties ?? []) {
        const settings = config.properties[property.id] ?? {};
        const child = this.store.childModel(property);
        const included = !excluded && settings.included !== false;
        const expanded = !collapsed.has(property.id);
        const issues = diagnostics.get(property.id) ?? [];
        const type = applyTypeOverride(property.type, settings.typeOverride);
        const customType = (javaOutput ? settings.javaType : settings.tsType)?.trim() || null;
        rows.push({
          property,
          domId: `sf-node-${rows.length}`,
          depth,
          parentId,
          hasChildren: !!child && child.properties.length > 0,
          expanded,
          typeLabel: typeLabel(type, nameOf),
          tone: typeTone(type),
          customType,
          required: settings.required ?? !property.optional,
          nullable: settings.nullable ?? property.nullable,
          included,
          validationCount: activeValidationKeys(settings.validations ?? {}).length,
          issue: issues.some((d) => d.severity === 'error')
            ? 'error'
            : issues.some((d) => d.severity === 'warning')
              ? 'warning'
              : null,
          isArray: property.type.kind === 'array',
          typeUndefined: !isTypeDefined(type) && !customType,
        });
        if (child && expanded) {
          visit(child.id, depth + 1, property.id, !included);
        }
      }
    };
    visit(schema.rootModelId, 1, null, false);
    return rows;
  });

  protected readonly activeRow = computed(() => {
    const rows = this.rows();
    const id = this.activeId() ?? this.store.selectedPropertyId();
    return rows.find((row) => row.property.id === id) ?? rows[0] ?? null;
  });

  constructor() {
    // Reveal the selected property, expanding its ancestors (e.g. selected from a diagnostic).
    effect(() => {
      const selected = this.store.selectedProperty();
      if (!selected) {
        return;
      }
      const ancestors = this.ancestorsOf(selected.modelId);
      if (ancestors.some((id) => this.collapsed().has(id))) {
        this.collapsed.update((set) => new Set([...set].filter((id) => !ancestors.includes(id))));
      }
      this.activeId.set(selected.id);
    });

    // Keep the active row visible while navigating or after an external selection.
    afterRenderEffect(() => {
      const row = this.activeRow();
      if (row) {
        this.host.nativeElement
          .querySelector(`#${row.domId}`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  protected toggle(row: TreeRow, event?: Event): void {
    event?.stopPropagation();
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(row.property.id)) {
        next.delete(row.property.id);
      } else {
        next.add(row.property.id);
      }
      return next;
    });
  }

  protected select(row: TreeRow): void {
    this.activeId.set(row.property.id);
    this.store.selectProperty(row.property.id);
  }

  protected defineType(row: TreeRow, event: Event): void {
    event.stopPropagation();
    this.activeId.set(row.property.id);
    this.store.openTypeDefinition(row.property.id);
  }

  protected openValidations(row: TreeRow, event: Event): void {
    event.stopPropagation();
    this.activeId.set(row.property.id);
    this.store.openValidations(row.property.id);
  }

  protected toggleIncluded(row: TreeRow, event: Event): void {
    event.stopPropagation();
    this.store.updateProperty(row.property.id, { included: row.included ? false : undefined });
  }

  expandAll(): void {
    this.collapsed.set(new Set());
  }

  collapseAll(): void {
    const ids = (this.store.schema()?.models ?? [])
      .flatMap((model) => model.properties)
      .filter((property) => this.store.childModel(property))
      .map((property) => property.id);
    this.collapsed.set(new Set(ids));
  }

  protected onKeydown(event: KeyboardEvent): void {
    const rows = this.rows();
    const current = this.activeRow();
    if (!current || rows.length === 0) {
      return;
    }
    const index = rows.indexOf(current);
    const move = (target: TreeRow | undefined): void => {
      if (target) {
        this.activeId.set(target.property.id);
      }
    };
    switch (event.key) {
      case 'ArrowDown':
        move(rows[index + 1]);
        break;
      case 'ArrowUp':
        move(rows[index - 1]);
        break;
      case 'Home':
        move(rows[0]);
        break;
      case 'End':
        move(rows[rows.length - 1]);
        break;
      case 'ArrowRight':
        if (current.hasChildren && !current.expanded) {
          this.toggle(current);
        } else if (current.hasChildren) {
          move(rows[index + 1]);
        }
        break;
      case 'ArrowLeft':
        if (current.hasChildren && current.expanded) {
          this.toggle(current);
        } else {
          move(rows.find((row) => row.property.id === current.parentId));
        }
        break;
      case 'Enter':
      case ' ':
        this.select(current);
        break;
      case 'Delete':
        this.toggleIncluded(current, event);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private ancestorsOf(modelId: string): string[] {
    const ids: string[] = [];
    const allProperties = [...this.store.propertiesById().values()];
    let current = this.store.modelsById().get(modelId);
    while (current && current.parentId !== null) {
      const owner = allProperties.find(
        (property) => this.store.childModel(property)?.id === current?.id,
      );
      if (!owner) {
        break;
      }
      ids.push(owner.id);
      current = this.store.modelsById().get(owner.modelId);
    }
    return ids;
  }
}
