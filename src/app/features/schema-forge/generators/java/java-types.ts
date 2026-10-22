import { JavaOptions } from '../../models/config.model';
import { InferredType } from '../../models/schema.model';

/** Broad family of a Java type, used to decide which validations are applicable. */
export type TypeCategory =
  'string' | 'integer' | 'decimal' | 'boolean' | 'collection' | 'temporal' | 'object' | 'other';

export interface JavaTypeRef {
  readonly text: string;
  readonly imports: readonly string[];
}

/** Imports for well-known simple type names used in inferred or custom types. */
export const JAVA_KNOWN_IMPORTS: Readonly<Record<string, string>> = {
  List: 'java.util.List',
  Set: 'java.util.Set',
  Map: 'java.util.Map',
  Collection: 'java.util.Collection',
  Optional: 'java.util.Optional',
  UUID: 'java.util.UUID',
  BigDecimal: 'java.math.BigDecimal',
  BigInteger: 'java.math.BigInteger',
  LocalDate: 'java.time.LocalDate',
  LocalDateTime: 'java.time.LocalDateTime',
  LocalTime: 'java.time.LocalTime',
  OffsetDateTime: 'java.time.OffsetDateTime',
  ZonedDateTime: 'java.time.ZonedDateTime',
  Instant: 'java.time.Instant',
  Duration: 'java.time.Duration',
};

/** Suggestions offered by the property editor for the custom Java type. */
export const JAVA_TYPE_SUGGESTIONS: readonly string[] = [
  'String',
  'Integer',
  'Long',
  'BigInteger',
  'BigDecimal',
  'Double',
  'Boolean',
  'LocalDate',
  'LocalDateTime',
  'OffsetDateTime',
  'Instant',
  'UUID',
  'Object',
  'List<String>',
  'List<Long>',
  'Map<String, Object>',
];

const PRIMITIVES: Readonly<Record<string, string>> = {
  Integer: 'int',
  Long: 'long',
  Double: 'double',
  Boolean: 'boolean',
};

const CATEGORY_BY_BASE: Readonly<Record<string, TypeCategory>> = {
  String: 'string',
  CharSequence: 'string',
  Integer: 'integer',
  Long: 'integer',
  Short: 'integer',
  Byte: 'integer',
  BigInteger: 'integer',
  int: 'integer',
  long: 'integer',
  short: 'integer',
  byte: 'integer',
  BigDecimal: 'decimal',
  Double: 'decimal',
  Float: 'decimal',
  double: 'decimal',
  float: 'decimal',
  Boolean: 'boolean',
  boolean: 'boolean',
  List: 'collection',
  Set: 'collection',
  Collection: 'collection',
  Map: 'collection',
  LocalDate: 'temporal',
  LocalDateTime: 'temporal',
  LocalTime: 'temporal',
  OffsetDateTime: 'temporal',
  ZonedDateTime: 'temporal',
  Instant: 'temporal',
  Object: 'other',
  UUID: 'other',
};

const JAVA_TYPE_PATTERN = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*(<[\w$.,<>?\s[\]]+>)?(\[\])*$/;

/** Checks the syntax of a user supplied Java type such as `List<LocalDate>`. */
export function isValidJavaType(text: string): boolean {
  const value = text.trim();
  if (!JAVA_TYPE_PATTERN.test(value)) {
    return false;
  }
  let depth = 0;
  for (const char of value) {
    if (char === '<') {
      depth++;
    } else if (char === '>' && --depth < 0) {
      return false;
    }
  }
  return depth === 0;
}

/** Finds the imports required by the simple type names used in a type expression. */
export function importsForTypeText(text: string): string[] {
  const imports = new Set<string>();
  const withoutQualified = text.replace(/[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+/g, '');
  for (const match of withoutQualified.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const known = JAVA_KNOWN_IMPORTS[match[0]];
    if (known) {
      imports.add(known);
    }
  }
  return [...imports];
}

export function javaCategory(typeText: string): TypeCategory {
  const value = typeText.trim();
  if (value.endsWith('[]')) {
    return 'collection';
  }
  const base = value.replace(/<.*$/s, '').trim();
  const simple = base.slice(base.lastIndexOf('.') + 1);
  return CATEGORY_BY_BASE[simple] ?? 'object';
}

/**
 * Class name with the configured suffix. A name that already ends with the suffix keeps it
 * once (`ClienteDTO` + `DTO` → `ClienteDTO`).
 */
export function javaClassName(
  modelName: string,
  options: Pick<JavaOptions, 'classSuffix'>,
): string {
  const suffix = options.classSuffix.trim();
  return suffix && modelName.endsWith(suffix) && modelName !== suffix
    ? modelName
    : modelName + suffix;
}

/**
 * Category of the Java type a property will have: the custom type when set, otherwise the
 * mapping of its (resolved) inferred type. Model names do not affect the category.
 */
export function javaTypeCategory(type: InferredType, customType: string | null): TypeCategory {
  if (customType) {
    return javaCategory(customType);
  }
  if (type.kind === 'object') {
    return 'object';
  }
  return javaCategory(mapInferredJavaType(type, CATEGORY_OPTIONS, new Map()).text);
}

const CATEGORY_OPTIONS: JavaOptions = {
  basePackage: '',
  classSuffix: '',
  integerType: 'Long',
  decimalType: 'BigDecimal',
  optionalHandling: 'wrapper',
  fieldNaming: 'camelCase',
  jakartaValidation: true,
  cascadeValidation: true,
  jacksonAnnotations: false,
  defaultConstructor: false,
  allArgsConstructor: false,
  lombok: {
    getter: false,
    setter: false,
    data: false,
    noArgsConstructor: false,
    allArgsConstructor: false,
    builder: false,
  },
};

/** Maps an inferred type to its (boxed) Java representation. */
export function mapInferredJavaType(
  type: InferredType,
  options: JavaOptions,
  modelNames: ReadonlyMap<string, string>,
): JavaTypeRef {
  switch (type.kind) {
    case 'string':
      return { text: 'String', imports: [] };
    case 'integer':
      if (type.range === 'big') {
        return { text: 'BigInteger', imports: ['java.math.BigInteger'] };
      }
      return { text: type.range === 'long' ? 'Long' : options.integerType, imports: [] };
    case 'decimal':
      return options.decimalType === 'BigDecimal'
        ? { text: 'BigDecimal', imports: ['java.math.BigDecimal'] }
        : { text: 'Double', imports: [] };
    case 'boolean':
      return { text: 'Boolean', imports: [] };
    case 'object':
      return {
        text: javaClassName(modelNames.get(type.modelId) ?? 'Object', options),
        imports: [],
      };
    case 'array': {
      const element = mapInferredJavaType(type.element, options, modelNames);
      return { text: `List<${element.text}>`, imports: ['java.util.List', ...element.imports] };
    }
    case 'unknown':
    case 'union':
      return { text: 'Object', imports: [] };
  }
}

/** Primitive equivalent of a boxed type, or `null` when there is none. */
export function primitiveOf(typeText: string): string | null {
  return PRIMITIVES[typeText] ?? null;
}
