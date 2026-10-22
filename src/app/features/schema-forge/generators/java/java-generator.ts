import {
  JAVA_RECORD_FORBIDDEN_COMPONENTS,
  JAVA_RESERVED_WORDS,
  toCamelCase,
  toSafeOriginal,
  toSnakeCase,
  uniqueName,
} from '../../../../core/utils/naming';
import { JavaOptions, LombokOptions } from '../../models/config.model';
import { GeneratedFile } from '../../models/generated-file.model';
import {
  ResolvedModel,
  ResolvedProperty,
  ResolvedSchema,
  ResolvedValidation,
} from '../../models/resolved.model';
import { InferredType } from '../../models/schema.model';
import { CodeWriter, docLines, escapeStringLiteral } from '../code-writer';
import {
  JavaTypeRef,
  TypeCategory,
  importsForTypeText,
  javaClassName,
  mapInferredJavaType,
  primitiveOf,
} from './java-types';

export type JavaStyle = 'class' | 'record' | 'lombok';

const INDENT = '    ';
const CONSTRAINTS = 'jakarta.validation.constraints';
const PACKAGE_PATTERN = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/i;
const INT_MAX = 2147483647n;
const INT_MIN = -2147483648n;

/** A Java field (or record component) prepared from a resolved property. */
export interface JavaField {
  readonly property: ResolvedProperty;
  readonly name: string;
  /** Declared type of the field or record component. */
  readonly type: string;
  /** Type returned by the getter; differs from `type` when `Optional` is used. */
  readonly getterType: string;
  readonly category: TypeCategory;
  readonly annotations: readonly string[];
  readonly imports: readonly string[];
}

export function isValidJavaPackage(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === '' ||
    (PACKAGE_PATTERN.test(trimmed) &&
      trimmed.split('.').every((segment) => !JAVA_RESERVED_WORDS.has(segment)))
  );
}

/** Base Java type of a property: the custom type when set, otherwise the inferred mapping. */
export function baseJavaType(
  property: ResolvedProperty,
  options: JavaOptions,
  modelNames: ReadonlyMap<string, string>,
): JavaTypeRef {
  if (property.javaType) {
    return { text: property.javaType, imports: importsForTypeText(property.javaType) };
  }
  return mapInferredJavaType(property.type, options, modelNames);
}

function referencesModel(type: InferredType): boolean {
  switch (type.kind) {
    case 'object':
      return true;
    case 'array':
      return referencesModel(type.element);
    case 'union':
      return false;
    default:
      return false;
  }
}

/** Java field name of a property before reserved-word and uniqueness adjustments. */
export function javaFieldName(
  property: Pick<ResolvedProperty, 'customName' | 'jsonName'>,
  options: Pick<JavaOptions, 'fieldNaming'>,
): string {
  let name: string;
  if (property.customName) {
    name = toSafeOriginal(property.customName);
  } else if (options.fieldNaming === 'snake_case') {
    name = toSnakeCase(property.jsonName);
  } else if (options.fieldNaming === 'original') {
    name = toSafeOriginal(property.jsonName);
  } else {
    name = toCamelCase(property.jsonName);
  }
  if (!name) {
    name = 'field';
  }
  if (/^\d/.test(name)) {
    name = `_${name}`;
  }
  return name;
}

/** `@Min`/`@Max` take a `long`: values outside the `int` range need the `L` suffix. */
function longLiteral(value: string): string {
  const big = BigInt(value);
  return big > INT_MAX || big < INT_MIN ? `${value}L` : value;
}

const SIMPLE_ANNOTATIONS = {
  notNull: 'NotNull',
  notBlank: 'NotBlank',
  notEmpty: 'NotEmpty',
  email: 'Email',
} as const;

/** Renders one validation rule of the intermediate model as a Jakarta annotation. */
export function validationAnnotation(rule: ResolvedValidation): { name: string; text: string } {
  switch (rule.kind) {
    case 'notNull':
    case 'notBlank':
    case 'notEmpty':
    case 'email': {
      const name = SIMPLE_ANNOTATIONS[rule.kind];
      return { name, text: `@${name}` };
    }
    case 'size': {
      const parts: string[] = [];
      if (rule.min !== undefined) {
        parts.push(`min = ${rule.min}`);
      }
      if (rule.max !== undefined) {
        parts.push(`max = ${rule.max}`);
      }
      return { name: 'Size', text: `@Size(${parts.join(', ')})` };
    }
    case 'min':
    case 'max': {
      if (rule.decimal) {
        const name = rule.kind === 'min' ? 'DecimalMin' : 'DecimalMax';
        return { name, text: `@${name}("${escapeStringLiteral(rule.value)}")` };
      }
      const name = rule.kind === 'min' ? 'Min' : 'Max';
      return { name, text: `@${name}(${longLiteral(rule.value)})` };
    }
    case 'pattern':
      return {
        name: 'Pattern',
        text: `@Pattern(regexp = "${escapeStringLiteral(rule.regexp)}")`,
      };
  }
}

function validationAnnotations(property: ResolvedProperty, imports: Set<string>): string[] {
  return property.validations.map((rule) => {
    const { name, text } = validationAnnotation(rule);
    imports.add(`${CONSTRAINTS}.${name}`);
    return text;
  });
}

/** Prepares the fields of a model, resolving names, types, imports and annotations. */
export function buildJavaFields(
  model: ResolvedModel,
  schema: ResolvedSchema,
  options: JavaOptions,
  style: JavaStyle,
): JavaField[] {
  const used = new Set<string>();
  return model.properties.map((property) => {
    const imports = new Set<string>();
    let name = javaFieldName(property, options);
    if (
      JAVA_RESERVED_WORDS.has(name) ||
      (style === 'record' && JAVA_RECORD_FORBIDDEN_COMPONENTS.has(name))
    ) {
      name = `${name}_`;
    }
    name = uniqueName(name, used);

    const base = baseJavaType(property, options, schema.modelNames);
    base.imports.forEach((item) => imports.add(item));
    const category = property.category;

    let type = base.text;
    let getterType = base.text;
    const optionalMode = options.optionalHandling;
    if (optionalMode === 'primitive-required' && property.required && !property.nullable) {
      type = primitiveOf(base.text) ?? base.text;
      getterType = type;
    } else if (optionalMode === 'optional' && !property.required && style !== 'lombok') {
      imports.add('java.util.Optional');
      getterType = `Optional<${base.text}>`;
      if (style === 'record') {
        type = getterType;
      }
    }

    const annotations: string[] = [];
    if (options.jacksonAnnotations && name !== property.jsonName) {
      imports.add('com.fasterxml.jackson.annotation.JsonProperty');
      annotations.push(`@JsonProperty("${escapeStringLiteral(property.jsonName)}")`);
    }
    if (options.jakartaValidation) {
      // Configured rules first; @Valid (cascade) is independent from @NotNull (presence).
      annotations.push(...validationAnnotations(property, imports));
      if (options.cascadeValidation && !property.javaType && referencesModel(property.type)) {
        imports.add('jakarta.validation.Valid');
        annotations.push('@Valid');
      }
    }

    return { property, name, type, getterType, category, annotations, imports: [...imports] };
  });
}

/** Lombok annotations for the selected options, without redundant or conflicting ones. */
export function resolveLombokAnnotations(lombok: LombokOptions, fieldCount: number): string[] {
  const annotations: string[] = [];
  if (lombok.data) {
    annotations.push('Data');
  } else {
    if (lombok.getter) {
      annotations.push('Getter');
    }
    if (lombok.setter) {
      annotations.push('Setter');
    }
  }
  if (lombok.builder) {
    annotations.push('Builder');
  }
  if (lombok.noArgsConstructor) {
    annotations.push('NoArgsConstructor');
  }
  // @Builder needs an all-args constructor when a no-args constructor is also requested;
  // without fields both constructors would have the same signature.
  const needsAllArgs = lombok.allArgsConstructor || (lombok.builder && lombok.noArgsConstructor);
  if (needsAllArgs && !(fieldCount === 0 && lombok.noArgsConstructor)) {
    annotations.push('AllArgsConstructor');
  }
  return annotations;
}

function sortImports(imports: Iterable<string>): string[][] {
  const unique = [...new Set(imports)].sort();
  const isJdk = (item: string): boolean => item.startsWith('java.') || item.startsWith('javax.');
  return [unique.filter((item) => !isJdk(item)), unique.filter(isJdk)].filter(
    (group) => group.length > 0,
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function writeHeader(writer: CodeWriter, packageName: string, imports: Iterable<string>): void {
  if (packageName) {
    writer.line(`package ${packageName};`).blank();
  }
  for (const group of sortImports(imports)) {
    group.forEach((item) => writer.line(`import ${item};`));
    writer.blank();
  }
}

function writeFieldDoc(writer: CodeWriter, description: string): void {
  if (!description) {
    return;
  }
  writer.line('/**');
  docLines(description).forEach((line) => writer.line(line ? ` * ${line}` : ' *'));
  writer.line(' */');
}

function writeClassBody(
  writer: CodeWriter,
  className: string,
  fields: JavaField[],
  options: JavaOptions,
  style: 'class' | 'lombok',
): void {
  const spaced = fields.some((field) => field.annotations.length > 0 || field.property.description);
  writer.indent();
  fields.forEach((field, index) => {
    if (index === 0 || spaced) {
      writer.blank();
    }
    writer.declare(field.property.id, () => {
      writeFieldDoc(writer, field.property.description);
      field.annotations.forEach((annotation) => writer.line(annotation));
      writer.line(`private ${field.type} ${field.name};`);
    });
  });

  if (style === 'class') {
    if (options.defaultConstructor) {
      writer.blank().line(`public ${className}() {`).line('}');
    }
    if (options.allArgsConstructor && fields.length > 0) {
      const params = fields.map((field) => `${field.type} ${field.name}`).join(', ');
      writer.blank().line(`public ${className}(${params}) {`).indent();
      fields.forEach((field) => writer.line(`this.${field.name} = ${field.name};`));
      writer.outdent().line('}');
    }
    for (const field of fields) {
      const suffix = capitalize(field.name);
      const getterPrefix = field.getterType === 'boolean' ? 'is' : 'get';
      const value =
        field.getterType === field.type ? field.name : `Optional.ofNullable(${field.name})`;
      writer
        .blank()
        .line(`public ${field.getterType} ${getterPrefix}${suffix}() {`)
        .indent()
        .line(`return ${value};`)
        .outdent()
        .line('}');
      writer
        .blank()
        .line(`public void set${suffix}(${field.type} ${field.name}) {`)
        .indent()
        .line(`this.${field.name} = ${field.name};`)
        .outdent()
        .line('}');
    }
  }
  writer.outdent();
}

function writeRecordBody(writer: CodeWriter, recordName: string, fields: JavaField[]): void {
  if (fields.length === 0) {
    writer.line(`public record ${recordName}() {`);
    return;
  }
  writer.line(`public record ${recordName}(`).indent().indent();
  fields.forEach((field, index) => {
    const annotations = field.annotations.length > 0 ? `${field.annotations.join(' ')} ` : '';
    const end = index === fields.length - 1 ? ') {' : ',';
    writer.declare(field.property.id, () =>
      writer.line(`${annotations}${field.type} ${field.name}${end}`),
    );
  });
  writer.outdent().outdent();
}

function generateModel(
  model: ResolvedModel,
  schema: ResolvedSchema,
  options: JavaOptions,
  style: JavaStyle,
  packageName: string,
): GeneratedFile {
  const className = javaClassName(model.name, options);
  const fields = buildJavaFields(model, schema, options, style);
  const imports = new Set(fields.flatMap((field) => field.imports));
  const lombokAnnotations =
    style === 'lombok' ? resolveLombokAnnotations(options.lombok, fields.length) : [];
  lombokAnnotations.forEach((annotation) => imports.add(`lombok.${annotation}`));

  const writer = new CodeWriter(INDENT);
  writeHeader(writer, packageName, imports);

  const documented = fields.filter((field) => field.property.description);
  if (style === 'record' && documented.length > 0) {
    writer.line('/**');
    for (const field of documented) {
      const [first, ...rest] = docLines(field.property.description);
      writer.line(` * @param ${field.name} ${first}`);
      rest.forEach((line) => writer.line(` *        ${line}`));
    }
    writer.line(' */');
  }

  if (style === 'record') {
    writeRecordBody(writer, className, fields);
  } else {
    lombokAnnotations.forEach((annotation) => writer.line(`@${annotation}`));
    writer.line(`public class ${className} {`);
    writeClassBody(writer, className, fields, options, style);
  }
  writer.line('}');

  const directory = packageName ? `${packageName.replace(/\./g, '/')}/` : '';
  return {
    path: `java/${directory}${className}.java`,
    name: `${className}.java`,
    language: 'java',
    modelId: model.id,
    content: writer.toString(),
    declarations: writer.declarations,
  };
}

/** Generates one Java source file per resolved model. Pure and deterministic. */
export function generateJava(
  schema: ResolvedSchema,
  options: JavaOptions,
  style: JavaStyle,
): GeneratedFile[] {
  const sanitizedOptions: JavaOptions = {
    ...options,
    classSuffix: toSafeOriginal(options.classSuffix),
  };
  const packageName = isValidJavaPackage(options.basePackage) ? options.basePackage.trim() : '';
  return schema.models.map((model) =>
    generateModel(model, schema, sanitizedOptions, style, packageName),
  );
}
