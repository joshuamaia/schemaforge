import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTooltip } from '@angular/material/tooltip';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { javaFieldName } from '../../generators/java/java-generator';
import {
  JAVA_TYPE_SUGGESTIONS,
  TypeCategory,
  javaClassName,
  mapInferredJavaType,
} from '../../generators/java/java-types';
import {
  applyTypeOverride,
  isTypeDefined,
  suggestModelName,
} from '../../generators/schema-resolver';
import { tsPropertyName } from '../../generators/typescript/typescript-generator';
import {
  TS_TYPE_SUGGESTIONS,
  mapInferredTsType,
} from '../../generators/typescript/typescript-types';
import {
  PropertyConfig,
  SizeRule,
  TYPE_OVERRIDE_LABELS,
  TypeOverride,
  ValidationConfig,
} from '../../models/config.model';
import { SchemaProperty } from '../../models/schema.model';
import { IconName } from '../../../../shared/components/icon/icons';
import { PropertyEditorTab, SchemaForgeStore } from '../../services/schema-forge.store';
import { propertyCategory } from '../../validators/model-validator';
import {
  VALIDATION_RULES,
  activeValidationKeys,
  ValidationKey,
  boundAnnotation,
  isValidationCompatible,
} from '../../validators/validation-rules';
import { typeLabel } from '../structure-panel/type-label';

const CATEGORY_LABELS: Readonly<Record<TypeCategory, string>> = {
  string: 'texto',
  integer: 'inteiro',
  decimal: 'decimal',
  boolean: 'booleano',
  collection: 'coleção',
  temporal: 'data/hora',
  object: 'objeto',
  other: 'genérico',
};

/** Inline editor for the configuration of the selected property. */
@Component({
  selector: 'sf-property-editor',
  imports: [
    MatButton,
    MatIconButton,
    MatCheckbox,
    MatSlideToggle,
    MatSelect,
    MatFormField,
    MatLabel,
    MatHint,
    MatInput,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatOption,
    MatTooltip,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './property-editor.component.html',
  styleUrl: './property-editor.component.scss',
})
export class PropertyEditorComponent {
  readonly property = input.required<SchemaProperty>();

  protected readonly store = inject(SchemaForgeStore);
  protected readonly tabs: readonly { id: PropertyEditorTab; label: string; icon: IconName }[] = [
    { id: 'identity', label: 'Identificação', icon: 'pencil' },
    { id: 'settings', label: 'Configurações', icon: 'settings' },
    { id: 'validations', label: 'Validações', icon: 'shield-check' },
  ];
  protected readonly flagRules = ['notNull', 'notBlank', 'notEmpty', 'email'] as const;
  protected readonly typeChoices = Object.entries(TYPE_OVERRIDE_LABELS) as [TypeOverride, string][];
  protected readonly boundRules = ['min', 'max'] as const;
  protected readonly javaSuggestions = JAVA_TYPE_SUGGESTIONS;
  protected readonly tsSuggestions = TS_TYPE_SUGGESTIONS;

  protected readonly settings = computed<PropertyConfig>(
    () => this.store.config().properties[this.property().id] ?? {},
  );
  protected readonly validations = computed<ValidationConfig>(
    () => this.settings().validations ?? {},
  );
  protected readonly validationCount = computed(
    () => activeValidationKeys(this.validations()).length,
  );
  protected readonly required = computed(
    () => this.settings().required ?? !this.property().optional,
  );
  protected readonly nullable = computed(
    () => this.settings().nullable ?? this.property().nullable,
  );
  protected readonly included = computed(() => this.settings().included !== false);
  protected readonly isTypeScript = computed(() => this.store.format() === 'typescript');

  protected readonly category = computed(() => {
    const schema = this.store.schema();
    return schema ? propertyCategory(schema, this.property().id, this.store.config()) : 'other';
  });
  protected readonly categoryLabel = computed(() => CATEGORY_LABELS[this.category()]);

  private readonly modelNames = computed(() => this.store.generation().schema.modelNames);

  /** The value could not be inferred (only null, empty arrays or mixed types). */
  protected readonly needsTypeDefinition = computed(() => !isTypeDefined(this.property().type));
  protected readonly typeOverride = computed(() => this.settings().typeOverride ?? null);
  protected readonly isArray = computed(() => this.property().type.kind === 'array');
  /** Inferred type with the user type definition applied. */
  private readonly effectiveType = computed(() =>
    applyTypeOverride(this.property().type, this.settings().typeOverride),
  );

  protected readonly inferredLabel = computed(() =>
    typeLabel(this.effectiveType(), (id) => this.modelNames().get(id) ?? null),
  );
  protected readonly inferredJavaType = computed(() => {
    const java = this.store.config().java;
    const names = new Map(
      [...this.modelNames()].map(([id, name]) => [id, javaClassName(name, java)] as const),
    );
    return mapInferredJavaType(this.effectiveType(), { ...java, classSuffix: '' }, names).text;
  });
  protected readonly inferredTsType = computed(() =>
    mapInferredTsType(this.effectiveType(), this.modelNames()),
  );

  protected readonly defaultName = computed(() => {
    const config = this.store.config();
    const source = { customName: null, jsonName: this.property().key };
    return this.isTypeScript()
      ? tsPropertyName(source, config.typescript)
      : javaFieldName(source, config.java) || 'field';
  });

  protected readonly childModel = computed(() => this.store.childModel(this.property()));
  protected readonly childModelSuggestion = computed(() => {
    const child = this.childModel();
    if (!child) {
      return '';
    }
    const config = this.store.config();
    return suggestModelName(child, { ...config, models: {} });
  });
  protected readonly childModelName = computed(() => {
    const child = this.childModel();
    return child ? (this.store.config().models[child.id]?.name ?? '') : '';
  });

  protected readonly occurrences = computed(() => {
    const property = this.property();
    return property.sampleCount > 1
      ? `Presente em ${property.presentCount} de ${property.sampleCount} objetos`
      : null;
  });

  protected readonly diagnostics = computed(
    () => this.store.diagnosticsByProperty().get(this.property().id) ?? [],
  );

  protected isActive(key: ValidationKey): boolean {
    const value = this.validations()[key];
    return value !== undefined && value !== false && value !== '';
  }

  protected isCompatible(key: ValidationKey): boolean {
    return isValidationCompatible(key, this.category());
  }

  protected ruleLabel(key: ValidationKey): string {
    if (key === 'min' || key === 'max') {
      return `@${boundAnnotation(key, this.category())}`;
    }
    return VALIDATION_RULES.find((rule) => rule.key === key)?.label ?? key;
  }

  protected incompatibleReason(key: ValidationKey): string {
    return `${this.ruleLabel(key)} não se aplica a campos do tipo ${this.categoryLabel()}.`;
  }

  // --- Updates ------------------------------------------------------------------------
  protected update(patch: Partial<PropertyConfig>): void {
    this.store.updateProperty(this.property().id, patch);
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected setText(
    field: 'generatedName' | 'description' | 'javaType' | 'tsType',
    event: Event,
  ): void {
    this.update({ [field]: this.text(event) || undefined });
  }

  protected setTypeOverride(value: TypeOverride | null): void {
    this.update({ typeOverride: value ?? undefined });
  }

  protected setRequired(value: boolean): void {
    this.update({ required: value === !this.property().optional ? undefined : value });
  }

  protected setNullable(value: boolean): void {
    this.update({ nullable: value === this.property().nullable ? undefined : value });
  }

  protected setIncluded(value: boolean): void {
    this.update({ included: value ? undefined : false });
  }

  protected setFlag(key: 'notNull' | 'notBlank' | 'notEmpty' | 'email', checked: boolean): void {
    this.store.updateValidations(this.property().id, { [key]: checked || undefined });
  }

  protected toggleValueRule(key: 'size' | 'min' | 'max' | 'pattern', checked: boolean): void {
    const defaults: ValidationConfig = {
      size: { min: 1, max: 255 },
      min: '0',
      max: this.category() === 'decimal' ? '999999.99' : '100',
      pattern: '^.+$',
    };
    this.store.updateValidations(this.property().id, {
      [key]: checked ? defaults[key] : undefined,
    });
  }

  protected setBound(key: 'min' | 'max' | 'pattern', event: Event): void {
    this.store.updateValidations(this.property().id, { [key]: this.text(event) });
  }

  protected setSize(bound: keyof SizeRule, event: Event): void {
    const raw = this.text(event).trim();
    const value = raw === '' ? undefined : Math.trunc(Number(raw));
    const size = {
      ...this.validations().size,
      [bound]: Number.isFinite(value) ? value : undefined,
    };
    this.store.updateValidations(this.property().id, { size });
  }

  protected setChildModelName(event: Event): void {
    const child = this.childModel();
    if (child) {
      this.store.setModelName(child.id, this.text(event));
    }
  }

  protected reset(): void {
    this.store.resetProperty(this.property().id);
    const child = this.childModel();
    if (child) {
      this.store.setModelName(child.id, '');
    }
  }
}
