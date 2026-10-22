import { ValidationConfig } from '../models/config.model';
import { ResolvedValidation } from '../models/resolved.model';
import type { TypeCategory } from '../generators/java/java-types';

export type ValidationKey = keyof ValidationConfig;

export interface ValidationRule {
  readonly key: ValidationKey;
  readonly label: string;
  readonly description: string;
  readonly categories: readonly TypeCategory[] | 'any';
}

export const VALIDATION_RULES: readonly ValidationRule[] = [
  {
    key: 'notNull',
    label: '@NotNull',
    description: 'Valor obrigatório: não aceita null.',
    categories: 'any',
  },
  {
    key: 'notBlank',
    label: '@NotBlank',
    description: 'Texto não vazio: exige ao menos um caractere que não seja espaço.',
    categories: ['string'],
  },
  {
    key: 'notEmpty',
    label: '@NotEmpty',
    description: 'Não aceita null nem vazio: texto com ao menos um caractere ou coleção com itens.',
    categories: ['string', 'collection'],
  },
  {
    key: 'email',
    label: '@Email',
    description: 'O texto deve ser um endereço de e-mail válido.',
    categories: ['string'],
  },
  {
    key: 'size',
    label: '@Size',
    description: 'Limita o tamanho de textos ou a quantidade de itens de coleções.',
    categories: ['string', 'collection'],
  },
  {
    key: 'min',
    label: '@Min',
    description: 'Valor mínimo permitido (@DecimalMin para decimais).',
    categories: ['integer', 'decimal'],
  },
  {
    key: 'max',
    label: '@Max',
    description: 'Valor máximo permitido (@DecimalMax para decimais).',
    categories: ['integer', 'decimal'],
  },
  {
    key: 'pattern',
    label: '@Pattern',
    description: 'O texto deve corresponder à expressão regular informada.',
    categories: ['string'],
  },
];

export function isValidationCompatible(key: ValidationKey, category: TypeCategory): boolean {
  const rule = VALIDATION_RULES.find((candidate) => candidate.key === key);
  return !!rule && (rule.categories === 'any' || rule.categories.includes(category));
}

/** Annotation used for a numeric bound, depending on the field type. */
export function boundAnnotation(kind: 'min' | 'max', category: TypeCategory): string {
  if (category === 'decimal') {
    return kind === 'min' ? 'DecimalMin' : 'DecimalMax';
  }
  return kind === 'min' ? 'Min' : 'Max';
}

/** Validation keys whose value is set (truthy flag or present parameters). */
export function activeValidationKeys(validations: ValidationConfig): ValidationKey[] {
  const keys: ValidationKey[] = [];
  for (const rule of VALIDATION_RULES) {
    const value = validations[rule.key];
    if (value === undefined || value === false || value === '') {
      continue;
    }
    if (rule.key === 'size') {
      const size = validations.size;
      if (!size || (size.min === undefined && size.max === undefined)) {
        continue;
      }
    }
    keys.push(rule.key);
  }
  return keys;
}

export const INTEGER_LITERAL = /^-?\d+$/;
export const DECIMAL_LITERAL = /^-?\d+(\.\d+)?$/;

const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;

/** Checks a @Min/@Max value: a `long` literal for integers, a decimal literal for decimals. */
export function isValidBoundValue(value: string, category: TypeCategory): boolean {
  const trimmed = value.trim();
  if (category === 'decimal') {
    return DECIMAL_LITERAL.test(trimmed);
  }
  if (!INTEGER_LITERAL.test(trimmed)) {
    return false;
  }
  const big = BigInt(trimmed);
  return big >= LONG_MIN && big <= LONG_MAX;
}

function isValidSizeBound(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0 && value <= 2147483647);
}

/** Checks that a pattern is a usable regular expression. */
export function isValidPattern(pattern: string): boolean {
  if (!pattern) {
    return false;
  }
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns the configured validations of a property into the rules stored in the intermediate
 * model: only rules compatible with the type category and with valid parameters are kept,
 * so the generated code always compiles. Nothing is added that was not configured.
 */
export function resolveValidations(
  validations: ValidationConfig,
  category: TypeCategory,
): ResolvedValidation[] {
  const rules: ResolvedValidation[] = [];
  for (const key of activeValidationKeys(validations)) {
    if (!isValidationCompatible(key, category)) {
      continue;
    }
    switch (key) {
      case 'notNull':
      case 'notBlank':
      case 'notEmpty':
      case 'email':
        rules.push({ kind: key });
        break;
      case 'size': {
        const { min, max } = validations.size ?? {};
        if (isValidSizeBound(min) && isValidSizeBound(max) && (min ?? 0) <= (max ?? Infinity)) {
          rules.push({
            kind: 'size',
            ...(min !== undefined && { min }),
            ...(max !== undefined && { max }),
          });
        }
        break;
      }
      case 'min':
      case 'max': {
        const value = (validations[key] ?? '').trim();
        if (isValidBoundValue(value, category)) {
          rules.push({ kind: key, value, decimal: category === 'decimal' });
        }
        break;
      }
      case 'pattern':
        if (validations.pattern && isValidPattern(validations.pattern)) {
          rules.push({ kind: 'pattern', regexp: validations.pattern });
        }
        break;
    }
  }
  return rules;
}
