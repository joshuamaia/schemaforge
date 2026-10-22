import { InferredType } from '../../models/schema.model';

export type TypeTone = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown' | 'mixed';

/** Short language-neutral label of an inferred type, e.g. `Telefone[]` or `integer`. */
export function typeLabel(type: InferredType, modelName: (id: string) => string | null): string {
  switch (type.kind) {
    case 'string':
    case 'boolean':
    case 'decimal':
      return type.kind;
    case 'integer':
      return type.range === 'int' ? 'integer' : type.range === 'long' ? 'long' : 'big integer';
    case 'unknown':
      return type.reason === 'null' ? 'null' : 'desconhecido';
    case 'object':
      return modelName(type.modelId) ?? 'object';
    case 'array': {
      const element = typeLabel(type.element, modelName);
      return `${type.element.kind === 'union' ? `(${element})` : element}[]`;
    }
    case 'union':
      return type.variants.map((variant) => typeLabel(variant, modelName)).join(' | ');
  }
}

export function typeTone(type: InferredType): TypeTone {
  switch (type.kind) {
    case 'string':
      return 'string';
    case 'integer':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    case 'union':
      return 'mixed';
    case 'unknown':
      return 'unknown';
  }
}
