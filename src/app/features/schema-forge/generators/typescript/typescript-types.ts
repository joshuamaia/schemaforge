import { InferredType } from '../../models/schema.model';

/** Suggestions offered by the property editor for the custom TypeScript type. */
export const TS_TYPE_SUGGESTIONS: readonly string[] = [
  'string',
  'number',
  'boolean',
  'Date',
  'unknown',
  'string[]',
  'number[]',
  'Record<string, unknown>',
];

/** Accepts type expressions but rejects text that could break out of a declaration. */
export function isValidTsType(text: string): boolean {
  const value = text.trim();
  if (!value || /[;{}=\n\r`]/.test(value) || value.includes('//') || value.includes('/*')) {
    return false;
  }
  let depth = 0;
  for (const char of value) {
    if ('<(['.includes(char)) {
      depth++;
    } else if ('>)]'.includes(char) && --depth < 0) {
      return false;
    }
  }
  return depth === 0;
}

function wrapForArray(text: string): string {
  return /[|&\s]/.test(text) ? `(${text})` : text;
}

/** Maps an inferred type to TypeScript. */
export function mapInferredTsType(
  type: InferredType,
  modelNames: ReadonlyMap<string, string>,
): string {
  switch (type.kind) {
    case 'string':
      return 'string';
    case 'integer':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'unknown':
      return 'unknown';
    case 'object':
      return modelNames.get(type.modelId) ?? 'unknown';
    case 'array': {
      const element = mapInferredTsType(type.element, modelNames);
      const nullable =
        type.elementNullable && element !== 'unknown' ? `${element} | null` : element;
      return `${wrapForArray(nullable)}[]`;
    }
    case 'union':
      return [
        ...new Set(type.variants.map((variant) => mapInferredTsType(variant, modelNames))),
      ].join(' | ');
  }
}
