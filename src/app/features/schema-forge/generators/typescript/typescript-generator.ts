import {
  isSimpleIdentifier,
  toCamelCase,
  toKebabCase,
  uniqueName,
} from '../../../../core/utils/naming';
import { TypeScriptOptions } from '../../models/config.model';
import { GeneratedFile } from '../../models/generated-file.model';
import { ResolvedModel, ResolvedProperty, ResolvedSchema } from '../../models/resolved.model';
import { InferredType } from '../../models/schema.model';
import { CodeWriter, docLines } from '../code-writer';
import { mapInferredTsType } from './typescript-types';

const INDENT = '  ';

export function typeScriptFileName(modelName: string): string {
  return `${toKebabCase(modelName) || 'model'}.model.ts`;
}

/** TypeScript property name, before quoting and uniqueness adjustments. */
export function tsPropertyName(
  property: Pick<ResolvedProperty, 'customName' | 'jsonName'>,
  options: Pick<TypeScriptOptions, 'propertyNaming'>,
): string {
  const name =
    property.customName ??
    (options.propertyNaming === 'camelCase'
      ? toCamelCase(property.jsonName) || property.jsonName
      : property.jsonName);
  return name;
}

function quoteKey(name: string): string {
  return isSimpleIdentifier(name) ? name : `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function collectModelRefs(type: InferredType, into: Set<string>): void {
  switch (type.kind) {
    case 'object':
      into.add(type.modelId);
      return;
    case 'array':
      collectModelRefs(type.element, into);
      return;
    case 'union':
      type.variants.forEach((variant) => collectModelRefs(variant, into));
      return;
  }
}

/** TypeScript type of a property, including `| null` when it is nullable. */
export function tsPropertyType(
  property: ResolvedProperty,
  modelNames: ReadonlyMap<string, string>,
): string {
  const base = property.tsType ?? mapInferredTsType(property.type, modelNames);
  if (!property.nullable || base === 'unknown' || /(^|\|)\s*null\s*($|\|)/.test(base)) {
    return base;
  }
  return `${base} | null`;
}

function generateModel(
  model: ResolvedModel,
  schema: ResolvedSchema,
  options: TypeScriptOptions,
): GeneratedFile {
  const writer = new CodeWriter(INDENT);

  const references = new Set<string>();
  for (const property of model.properties) {
    if (!property.tsType) {
      collectModelRefs(property.type, references);
    }
  }
  references.delete(model.id);
  const imports = [...references]
    .map((id) => schema.modelNames.get(id) as string)
    .sort((a, b) => typeScriptFileName(a).localeCompare(typeScriptFileName(b)));
  for (const name of imports) {
    writer.line(
      `import type { ${name} } from './${typeScriptFileName(name).replace(/\.ts$/, '')}';`,
    );
  }
  if (imports.length > 0) {
    writer.blank();
  }

  writer.line(`export interface ${model.name} {`).indent();
  const used = new Set<string>();
  for (const property of model.properties) {
    const key = quoteKey(uniqueName(tsPropertyName(property, options), used));
    const optional = property.required ? '' : '?';
    const modifier = options.readonlyProperties ? 'readonly ' : '';
    const type = tsPropertyType(property, schema.modelNames);
    writer.declare(property.id, () => {
      if (property.description) {
        const lines = docLines(property.description);
        if (lines.length === 1) {
          writer.line(`/** ${lines[0]} */`);
        } else {
          writer.line('/**');
          lines.forEach((line) => writer.line(line ? ` * ${line}` : ' *'));
          writer.line(' */');
        }
      }
      writer.line(`${modifier}${key}${optional}: ${type};`);
    });
  }
  writer.outdent().line('}');

  const fileName = typeScriptFileName(model.name);
  return {
    path: `typescript/${fileName}`,
    name: fileName,
    language: 'typescript',
    modelId: model.id,
    content: writer.toString(),
    declarations: writer.declarations,
  };
}

/** Generates one TypeScript interface file per resolved model. Pure and deterministic. */
export function generateTypeScript(
  schema: ResolvedSchema,
  options: TypeScriptOptions,
): GeneratedFile[] {
  return schema.models.map((model) => generateModel(model, schema, options));
}
