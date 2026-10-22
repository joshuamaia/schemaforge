import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Diagnostic } from '../../../core/models/diagnostic';
import { SourceRange } from '../../../core/models/source-range';
import { BrowserStorageService } from '../../../core/services/browser-storage.service';
import { GenerationResult, generateCode } from '../generators/code-generator';
import { toModelName } from '../generators/schema-resolver';
import {
  DEFAULT_ROOT_NAME,
  JavaOptions,
  LombokOptions,
  ModelConfig,
  OUTPUT_FORMAT_LABELS,
  OutputFormat,
  ProjectConfig,
  PropertyConfig,
  TypeScriptOptions,
  ValidationConfig,
  createDefaultConfig,
} from '../models/config.model';
import { JSON_EXAMPLES, JsonExample } from '../models/examples';
import { DeclarationSpan, GeneratedFile } from '../models/generated-file.model';
import { SchemaAnalysis, SchemaObjectModel, SchemaProperty } from '../models/schema.model';
import { EMPTY_ANALYSIS, JsonAnalysisResult } from '../parsers/json-analysis';
import { JsonAnalysisService } from './json-analysis.service';

const STORAGE_KEY = 'schemaforge.project';
export const ANALYSIS_DEBOUNCE_MS = 300;

interface PersistedProject {
  readonly json: string;
  readonly config: ProjectConfig;
}

const UNDEFINED_TYPE_CODES: ReadonlySet<Diagnostic['code']> = new Set([
  'null-only',
  'empty-array',
  'mixed-types',
  'heterogeneous-array',
]);

export type PropertyEditorTab = 'identity' | 'settings' | 'validations';

export interface StatusSummary {
  readonly state: 'empty' | 'analyzing' | 'valid' | 'invalid' | 'warning';
  readonly label: string;
  readonly properties: number;
  readonly objects: number;
  readonly files: number;
  readonly language: string;
}

function mergeConfig(saved: Partial<ProjectConfig> | null | undefined): ProjectConfig {
  const defaults = createDefaultConfig();
  if (!saved) {
    return defaults;
  }
  return {
    ...defaults,
    ...saved,
    java: {
      ...defaults.java,
      ...saved.java,
      lombok: { ...defaults.java.lombok, ...saved.java?.lombok },
    },
    typescript: { ...defaults.typescript, ...saved.typescript },
    models: saved.models ?? {},
    properties: saved.properties ?? {},
  };
}

/** Removes keys whose value is `undefined` so the configuration stays minimal. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

/**
 * Single source of truth of the editor. The input JSON and the user configuration are
 * independent signals; analysis, resolution and generated code are derived from them.
 */
@Injectable({ providedIn: 'root' })
export class SchemaForgeStore {
  private readonly analysisService = inject(JsonAnalysisService);
  private readonly storage = inject(BrowserStorageService);
  private analysisRun = 0;

  readonly examples = JSON_EXAMPLES;

  // --- Source state -------------------------------------------------------------------
  readonly jsonText = signal('');
  readonly config = signal<ProjectConfig>(createDefaultConfig());
  readonly analysis = signal<JsonAnalysisResult>(EMPTY_ANALYSIS);
  readonly analyzing = signal(false);
  readonly selectedPropertyId = signal<string | null>(null);
  /** Section shown by the property editor; kept while moving between properties. */
  readonly editorTab = signal<PropertyEditorTab>('identity');
  private readonly selectedFilePath = signal<string | null>(null);
  private readonly selectedFileModelId = signal<string | null>(null);
  /** Last schema produced by a valid JSON; kept while the user fixes syntax errors. */
  private readonly lastSchema = signal<SchemaAnalysis | null>(null);

  // --- Derived state ------------------------------------------------------------------
  readonly schema = this.lastSchema.asReadonly();
  readonly schemaIsStale = computed(() => !this.analysis().valid && this.lastSchema() !== null);
  readonly format = computed(() => this.config().format);

  readonly generation = computed<GenerationResult>(() =>
    generateCode(this.lastSchema(), this.config()),
  );
  readonly files = computed<readonly GeneratedFile[]>(() => this.generation().files);

  readonly propertiesById = computed(() => {
    const map = new Map<string, SchemaProperty>();
    for (const model of this.lastSchema()?.models ?? []) {
      for (const property of model.properties) {
        map.set(property.id, property);
      }
    }
    return map;
  });

  readonly modelsById = computed(
    () => new Map((this.lastSchema()?.models ?? []).map((model) => [model.id, model])),
  );

  readonly selectedProperty = computed(() => {
    const id = this.selectedPropertyId();
    return id ? (this.propertiesById().get(id) ?? null) : null;
  });

  /**
   * Diagnostics of the input JSON. Warnings about types that could not be inferred are
   * dropped once the user defines the type of that property.
   */
  readonly inputDiagnostics = computed<readonly Diagnostic[]>(() => {
    const properties = this.config().properties;
    return this.analysis().diagnostics.filter((diagnostic) => {
      if (!diagnostic.propertyId || !UNDEFINED_TYPE_CODES.has(diagnostic.code)) {
        return true;
      }
      const settings = properties[diagnostic.propertyId];
      return !settings?.typeOverride && !(settings?.javaType && settings?.tsType);
    });
  });

  /** Included properties whose type is still undefined for the current output language. */
  readonly undefinedTypeProperties = computed(() =>
    this.generation()
      .schema.models.flatMap((model) => model.properties)
      .filter((property) => !property.typeDefined),
  );
  readonly configDiagnostics = computed<readonly Diagnostic[]>(() =>
    this.analysis().valid ? this.generation().diagnostics : [],
  );
  readonly diagnostics = computed(() => [...this.inputDiagnostics(), ...this.configDiagnostics()]);
  readonly errors = computed(() => this.diagnostics().filter((d) => d.severity === 'error'));
  readonly warnings = computed(() => this.diagnostics().filter((d) => d.severity !== 'error'));

  /** Diagnostics per property id, used by the tree to flag problematic properties. */
  readonly diagnosticsByProperty = computed(() => {
    const map = new Map<string, Diagnostic[]>();
    for (const diagnostic of this.diagnostics()) {
      if (diagnostic.propertyId) {
        const list = map.get(diagnostic.propertyId) ?? [];
        list.push(diagnostic);
        map.set(diagnostic.propertyId, list);
      }
    }
    return map;
  });

  /** Property id as declared in the generated code (identical models are merged). */
  private readonly canonicalSelectedId = computed(() => {
    const id = this.selectedPropertyId();
    return id ? (this.generation().schema.canonicalProperties.get(id) ?? id) : null;
  });

  readonly activeFile = computed<GeneratedFile | null>(() => {
    const files = this.files();
    const path = this.selectedFilePath();
    const modelId = this.selectedFileModelId();
    const canonicalModel = modelId
      ? (this.generation().schema.canonicalModels.get(modelId) ?? modelId)
      : null;
    return (
      files.find((file) => file.path === path) ??
      files.find((file) => file.modelId === canonicalModel) ??
      files[0] ??
      null
    );
  });

  /** Declaration of the selected property in the active file, for highlighting. */
  readonly activeDeclaration = computed<DeclarationSpan | null>(() => {
    const id = this.canonicalSelectedId();
    const file = this.activeFile();
    return id && file ? (file.declarations[id] ?? null) : null;
  });

  /** Range revealed from the diagnostics list (e.g. a syntax error). */
  readonly focusedRange = signal<SourceRange | null>(null);

  /** Ranges highlighted in the JSON input: a focused diagnostic or the selected property. */
  readonly jsonHighlights = computed<readonly SourceRange[]>(() => {
    const focused = this.focusedRange();
    if (focused) {
      return [focused];
    }
    if (this.schemaIsStale()) {
      return [];
    }
    return this.selectedProperty()?.locations ?? [];
  });

  readonly status = computed<StatusSummary>(() => {
    const analysis = this.analysis();
    const schema = this.lastSchema();
    const config = this.config();
    const errors = this.errors().length;
    const warnings = this.warnings().filter((d) => d.severity === 'warning').length;
    let state: StatusSummary['state'];
    let label: string;
    if (this.analyzing()) {
      state = 'analyzing';
      label = 'Analisando…';
    } else if (!this.jsonText().trim()) {
      state = 'empty';
      label = 'Aguardando JSON';
    } else if (!analysis.valid) {
      state = 'invalid';
      label = analysis.syntaxError
        ? `JSON inválido (linha ${analysis.syntaxError.line}, coluna ${analysis.syntaxError.column})`
        : 'JSON inválido';
    } else if (errors > 0) {
      state = 'invalid';
      label = `${errors} erro${errors > 1 ? 's' : ''}`;
    } else if (warnings > 0) {
      state = 'warning';
      label = `JSON válido · ${warnings} aviso${warnings > 1 ? 's' : ''}`;
    } else {
      state = 'valid';
      label = 'JSON válido';
    }
    return {
      state,
      label,
      properties: schema?.models.reduce((sum, model) => sum + model.properties.length, 0) ?? 0,
      objects: schema?.models.length ?? 0,
      files: this.files().length,
      language: OUTPUT_FORMAT_LABELS[config.format],
    };
  });

  constructor() {
    const saved = this.storage.read<PersistedProject>(STORAGE_KEY);
    if (saved && typeof saved.json === 'string') {
      this.jsonText.set(saved.json);
      this.config.set(mergeConfig(saved.config));
    } else {
      const example = JSON_EXAMPLES[0];
      this.jsonText.set(example.json);
      this.config.update((config) => ({ ...config, rootName: example.rootName }));
    }

    // Debounced analysis of the input JSON.
    effect((onCleanup) => {
      const text = this.jsonText();
      const run = ++this.analysisRun;
      untracked(() => this.analyzing.set(true));
      const delay = untracked(() => this.analysis()) === EMPTY_ANALYSIS ? 0 : ANALYSIS_DEBOUNCE_MS;
      const timer = setTimeout(() => {
        this.analysisService.analyze(text).then((result) => {
          if (run !== this.analysisRun) {
            return;
          }
          this.analysis.set(result);
          if (result.valid) {
            this.lastSchema.set(result.schema);
          } else if (!text.trim()) {
            this.lastSchema.set(null);
          }
          this.analyzing.set(false);
        });
      }, delay);
      onCleanup(() => clearTimeout(timer));
    });

    // Persist the project (input and configuration) locally.
    effect((onCleanup) => {
      const project: PersistedProject = { json: this.jsonText(), config: this.config() };
      const timer = setTimeout(() => this.storage.write(STORAGE_KEY, project), 500);
      onCleanup(() => clearTimeout(timer));
    });

    // Drop a selection that no longer exists after the JSON changed.
    effect(() => {
      const id = this.selectedPropertyId();
      if (id && this.lastSchema() && !this.propertiesById().has(id)) {
        untracked(() => this.selectedPropertyId.set(null));
      }
    });
  }

  // --- JSON input ---------------------------------------------------------------------
  setJson(text: string): void {
    this.focusedRange.set(null);
    this.jsonText.set(text);
  }

  /** Reveals a diagnostic: selects its property, or highlights its range in the input. */
  focusDiagnostic(diagnostic: Diagnostic): void {
    if (diagnostic.propertyId && this.propertiesById().has(diagnostic.propertyId)) {
      this.selectProperty(diagnostic.propertyId);
    } else {
      this.focusedRange.set(diagnostic.range ?? null);
    }
  }

  /** Formats the current JSON (in the background when large). Resolves `false` if invalid. */
  async formatJson(): Promise<boolean> {
    const text = this.jsonText();
    const formatted = await this.analysisService.format(text);
    if (formatted === null) {
      return false;
    }
    if (this.jsonText() === text) {
      this.setJson(formatted);
    }
    return true;
  }

  loadExample(example: JsonExample): void {
    this.startDocument(example.rootName, example.json);
  }

  /** Loads an imported file; the root model is named after the file. */
  importJson(fileName: string, text: string): void {
    const baseName = fileName.replace(/\.[^.]+$/, '');
    this.startDocument(toModelName(baseName, DEFAULT_ROOT_NAME), text);
  }

  /** Replaces the document, keeping generation options but dropping per-path settings. */
  private startDocument(rootName: string, text: string): void {
    this.config.update((config) => ({ ...config, rootName, models: {}, properties: {} }));
    // The previous structure belongs to another document and must not be shown as stale.
    this.lastSchema.set(null);
    this.selectedPropertyId.set(null);
    this.selectedFilePath.set(null);
    this.selectedFileModelId.set(null);
    this.setJson(text);
  }

  /** Clears the input, the configuration and the selection. */
  clearProject(): void {
    this.config.set(createDefaultConfig());
    this.selectedPropertyId.set(null);
    this.selectedFilePath.set(null);
    this.selectedFileModelId.set(null);
    this.lastSchema.set(null);
    this.jsonText.set('');
    this.storage.remove(STORAGE_KEY);
  }

  clearJson(): void {
    this.jsonText.set('');
  }

  // --- Configuration ------------------------------------------------------------------
  setFormat(format: OutputFormat): void {
    this.config.update((config) => ({ ...config, format }));
    this.selectedFilePath.set(null);
  }

  setRootName(rootName: string): void {
    this.config.update((config) => ({ ...config, rootName }));
  }

  updateJava(patch: Partial<JavaOptions>): void {
    this.config.update((config) => ({ ...config, java: { ...config.java, ...patch } }));
  }

  updateLombok(patch: Partial<LombokOptions>): void {
    this.config.update((config) => ({
      ...config,
      java: { ...config.java, lombok: { ...config.java.lombok, ...patch } },
    }));
  }

  updateTypeScript(patch: Partial<TypeScriptOptions>): void {
    this.config.update((config) => ({
      ...config,
      typescript: { ...config.typescript, ...patch },
    }));
  }

  propertyConfig(id: string): PropertyConfig {
    return this.config().properties[id] ?? {};
  }

  updateProperty(id: string, patch: Partial<PropertyConfig>): void {
    this.config.update((config) => {
      const next = compact({ ...config.properties[id], ...patch });
      const properties = { ...config.properties };
      if (Object.keys(next).length === 0) {
        delete properties[id];
      } else {
        properties[id] = next;
      }
      return { ...config, properties };
    });
  }

  updateValidations(id: string, patch: Partial<ValidationConfig>): void {
    const current = this.propertyConfig(id).validations ?? {};
    const next = compact({ ...current, ...patch });
    this.updateProperty(id, { validations: Object.keys(next).length > 0 ? next : undefined });
  }

  resetProperty(id: string): void {
    this.config.update((config) => {
      const properties = { ...config.properties };
      delete properties[id];
      return { ...config, properties };
    });
  }

  setModelName(modelId: string, name: string): void {
    this.config.update((config) => {
      const models: Record<string, ModelConfig> = { ...config.models };
      if (name.trim()) {
        models[modelId] = { name };
      } else {
        delete models[modelId];
      }
      return { ...config, models };
    });
  }

  /** Resolved name of a model in the current output (suffix not included). */
  modelName(modelId: string): string | null {
    return this.generation().schema.modelNames.get(modelId) ?? null;
  }

  childModel(property: SchemaProperty): SchemaObjectModel | null {
    let type = property.type;
    while (type.kind === 'array') {
      type = type.element;
    }
    if (type.kind === 'union') {
      const object = type.variants.find((variant) => variant.kind === 'object');
      type = object ?? type;
    }
    return type.kind === 'object' ? (this.modelsById().get(type.modelId) ?? null) : null;
  }

  // --- Selection ----------------------------------------------------------------------
  selectProperty(id: string | null): void {
    this.focusedRange.set(null);
    this.selectedPropertyId.set(id);
    if (!id) {
      return;
    }
    const generation = this.generation();
    const canonical = generation.schema.canonicalProperties.get(id) ?? id;
    const file = generation.files.find((candidate) => candidate.declarations[canonical]);
    if (file) {
      this.selectedFilePath.set(file.path);
      this.selectedFileModelId.set(file.modelId);
    } else {
      const property = this.propertiesById().get(id);
      this.selectedFilePath.set(null);
      this.selectedFileModelId.set(property?.modelId ?? null);
    }
  }

  /** Selects a property and opens the section where its type is defined. */
  openTypeDefinition(id: string): void {
    this.selectProperty(id);
    this.editorTab.set('settings');
  }

  /** Selects a property and opens its validation rules. */
  openValidations(id: string): void {
    this.selectProperty(id);
    this.editorTab.set('validations');
  }

  selectFile(file: GeneratedFile): void {
    this.selectedFilePath.set(file.path);
    this.selectedFileModelId.set(file.modelId);
  }
}
