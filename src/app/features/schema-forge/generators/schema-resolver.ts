import { Diagnostic } from '../../../core/models/diagnostic';
import {
  JAVA_LANG_TYPES,
  JAVA_RESERVED_WORDS,
  TS_GLOBAL_TYPES,
  isSimpleIdentifier,
  singularize,
  toPascalCase,
  uniqueName,
} from '../../../core/utils/naming';
import { DEFAULT_ROOT_NAME, ProjectConfig, TypeOverride } from '../models/config.model';
import {
  ResolvedModel,
  ResolvedProperty,
  ResolvedSchema,
  TargetLanguage,
} from '../models/resolved.model';
import { InferredType, SchemaAnalysis, SchemaObjectModel } from '../models/schema.model';
import { resolveValidations } from '../validators/validation-rules';
import { isValidJavaType, javaTypeCategory } from './java/java-types';
import { isValidTsType } from './typescript/typescript-types';

const RESERVED_TYPE_NAMES = new Set([...JAVA_LANG_TYPES, ...TS_GLOBAL_TYPES]);

/**
 * Normalizes a name into a type name. A name that is already a valid identifier keeps its
 * spelling (`ClienteDTO` stays `ClienteDTO`); other text is converted to PascalCase.
 */
export function toModelName(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (isSimpleIdentifier(trimmed) && !trimmed.includes('$') && !/^_/.test(trimmed)) {
    const name = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    if (!JAVA_RESERVED_WORDS.has(name)) {
      return name;
    }
  }
  const name = toPascalCase(trimmed);
  if (!name) {
    return fallback;
  }
  return /^\d/.test(name) ? `Model${name}` : name;
}

const OVERRIDE_TYPES: Readonly<Record<TypeOverride, InferredType>> = {
  string: { kind: 'string' },
  integer: { kind: 'integer', range: 'int' },
  decimal: { kind: 'decimal' },
  boolean: { kind: 'boolean' },
};

/**
 * Applies the type defined by the user. Values that are not objects (including `null`-only
 * and mixed values) take the defined type; for arrays the element type is defined.
 */
export function applyTypeOverride(type: InferredType, override?: TypeOverride): InferredType {
  if (!override) {
    return type;
  }
  switch (type.kind) {
    case 'array':
      return { ...type, element: applyTypeOverride(type.element, override) };
    case 'object':
      return type;
    default:
      return OVERRIDE_TYPES[override];
  }
}

/** `false` when a type still contains values that could not be inferred. */
export function isTypeDefined(type: InferredType): boolean {
  switch (type.kind) {
    case 'unknown':
    case 'union':
      return false;
    case 'array':
      return isTypeDefined(type.element);
    default:
      return true;
  }
}

/** Default name of a model: the root name, or a name derived from the owning property. */
export function suggestModelName(model: SchemaObjectModel, config: ProjectConfig): string {
  if (model.parentId === null && model.sourceKey === null) {
    return toModelName(config.rootName, DEFAULT_ROOT_NAME);
  }
  const custom = config.models[model.id]?.name?.trim();
  if (custom) {
    return toModelName(custom, 'Item');
  }
  const key = model.sourceKey ?? 'item';
  return toModelName(model.fromArray ? singularize(key) : key, 'Item');
}

function mapObjectRefs(type: InferredType, map: (modelId: string) => string): InferredType {
  switch (type.kind) {
    case 'object':
      return { kind: 'object', modelId: map(type.modelId) };
    case 'array':
      return { ...type, element: mapObjectRefs(type.element, map) };
    case 'union':
      return {
        kind: 'union',
        variants: type.variants.map((variant) => mapObjectRefs(variant, map)),
      };
    default:
      return type;
  }
}

function collectObjectRefs(type: InferredType, into: string[]): void {
  switch (type.kind) {
    case 'object':
      into.push(type.modelId);
      return;
    case 'array':
      collectObjectRefs(type.element, into);
      return;
    case 'union':
      type.variants.forEach((variant) => collectObjectRefs(variant, into));
      return;
  }
}

/**
 * Applies the user configuration to the inferred schema for one target language: removes
 * excluded properties and unreachable models, merges structurally identical models that
 * would get the same name, and assigns unique, valid model names.
 */
export function resolveSchema(
  analysis: SchemaAnalysis | null,
  config: ProjectConfig,
  language: TargetLanguage,
): ResolvedSchema {
  const diagnostics: Diagnostic[] = [];
  if (!analysis || analysis.rootModelId === null) {
    return {
      language,
      rootModelId: null,
      models: [],
      canonicalModels: new Map(),
      canonicalProperties: new Map(),
      modelNames: new Map(),
      diagnostics,
    };
  }

  const byId = new Map(analysis.models.map((model) => [model.id, model]));
  const order = new Map(analysis.models.map((model, index) => [model.id, index]));

  // 1. Apply property configuration and find reachable models.
  const draftProperties = new Map<string, ResolvedProperty[]>();
  const reachable: string[] = [];
  const queue = [analysis.rootModelId];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const model = byId.get(queue.shift() as string);
    if (!model) {
      continue;
    }
    reachable.push(model.id);
    const properties: ResolvedProperty[] = [];
    for (const property of model.properties) {
      const settings = config.properties[property.id] ?? {};
      if (settings.included === false) {
        continue;
      }
      const rawJavaType = settings.javaType?.trim() || null;
      const rawTsType = settings.tsType?.trim() || null;
      const javaType = rawJavaType && isValidJavaType(rawJavaType) ? rawJavaType : null;
      const tsType = rawTsType && isValidTsType(rawTsType) ? rawTsType : null;
      const type = applyTypeOverride(property.type, settings.typeOverride);
      const category = javaTypeCategory(type, javaType);
      const resolved: ResolvedProperty = {
        id: property.id,
        modelId: model.id,
        jsonName: property.key,
        customName: settings.generatedName?.trim() || null,
        description: settings.description?.trim() ?? '',
        type,
        typeDefined: isTypeDefined(type) || !!(language === 'java' ? javaType : tsType),
        required: settings.required ?? !property.optional,
        nullable: settings.nullable ?? property.nullable,
        javaType,
        tsType,
        category,
        validations: resolveValidations(settings.validations ?? {}, category),
      };
      properties.push(resolved);
      const overridden = language === 'java' ? resolved.javaType : resolved.tsType;
      if (overridden === null) {
        const refs: string[] = [];
        collectObjectRefs(type, refs);
        for (const ref of refs) {
          if (!visited.has(ref)) {
            visited.add(ref);
            queue.push(ref);
          }
        }
      }
    }
    draftProperties.set(model.id, properties);
  }
  reachable.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  // 2. Merge structurally identical models with the same suggested name (children first).
  const baseNames = new Map(
    reachable.map((id) => [id, suggestModelName(byId.get(id) as SchemaObjectModel, config)]),
  );
  const canonicalModels = new Map<string, string>();
  const canonicalOf = (id: string): string => canonicalModels.get(id) ?? id;
  const bySignature = new Map<string, string>();
  for (const id of [...reachable].reverse()) {
    const properties = (draftProperties.get(id) ?? []).map((property) => ({
      ...property,
      type: mapObjectRefs(property.type, canonicalOf),
    }));
    draftProperties.set(id, properties);
    const signature = JSON.stringify([
      baseNames.get(id),
      properties.map((property) => [
        property.jsonName,
        property.customName,
        property.description,
        property.type,
        property.required,
        property.nullable,
        property.javaType,
        property.tsType,
        property.validations,
      ]),
    ]);
    const existing = id === analysis.rootModelId ? undefined : bySignature.get(signature);
    if (existing) {
      canonicalModels.set(id, existing);
    } else {
      canonicalModels.set(id, id);
      if (id !== analysis.rootModelId) {
        bySignature.set(signature, id);
      }
    }
  }

  const canonicalProperties = new Map<string, string>();
  for (const id of reachable) {
    const target = canonicalOf(id);
    if (target === id) {
      continue;
    }
    const targetProperties = draftProperties.get(target) ?? [];
    for (const property of draftProperties.get(id) ?? []) {
      const match = targetProperties.find((candidate) => candidate.jsonName === property.jsonName);
      if (match) {
        canonicalProperties.set(property.id, match.id);
      }
    }
  }

  // 3. Assign unique names in discovery order; the earliest alias decides the position.
  const firstIndex = new Map<string, number>();
  for (const id of reachable) {
    const target = canonicalOf(id);
    if (!firstIndex.has(target)) {
      firstIndex.set(target, order.get(id) ?? 0);
    }
  }
  const canonicalIds = [...firstIndex.keys()].sort(
    (a, b) => (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0),
  );
  const used = new Set<string>();
  const modelNames = new Map<string, string>();
  for (const id of canonicalIds) {
    const model = byId.get(id) as SchemaObjectModel;
    let base = baseNames.get(id) ?? 'Item';
    // Names such as `String` or `Object` would shadow java.lang types and break compilation.
    if (RESERVED_TYPE_NAMES.has(base)) {
      diagnostics.push({
        severity: 'warning',
        code: 'name-conflict',
        message: `O nome "${base}" conflita com um tipo nativo de Java/TypeScript e foi alterado para "${base}Model".`,
      });
      base = `${base}Model`;
    }
    let name = base;
    if (used.has(name.toLowerCase()) && model.parentId !== null) {
      // Prefix with the parent name only when it adds information: `Entrega` + `Endereco`
      // is useful, while `Cliente` + `Cliente` or `PedidoItem` + `Item` is redundant.
      const parentName = modelNames.get(canonicalOf(model.parentId));
      if (parentName && !parentName.toLowerCase().endsWith(base.toLowerCase())) {
        name = `${parentName}${base}`;
      }
    }
    const unique = uniqueName(name, used);
    if (unique !== base) {
      diagnostics.push({
        severity: 'info',
        code: 'name-conflict',
        message: `Já existe um modelo chamado "${base}"; o modelo de "${model.sourceKey ?? model.id}" foi nomeado "${unique}". Você pode renomeá-lo no editor da propriedade.`,
      });
    }
    modelNames.set(id, unique);
  }
  for (const id of reachable) {
    modelNames.set(id, modelNames.get(canonicalOf(id)) as string);
  }

  const models: ResolvedModel[] = canonicalIds.map((id) => ({
    id,
    name: modelNames.get(id) as string,
    isRoot: id === analysis.rootModelId,
    properties: draftProperties.get(id) ?? [],
  }));

  return {
    language,
    rootModelId: analysis.rootModelId,
    models,
    canonicalModels,
    canonicalProperties,
    modelNames,
    diagnostics,
  };
}
