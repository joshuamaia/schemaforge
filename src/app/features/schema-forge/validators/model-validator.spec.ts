import { analyze, buildConfig } from '../testing/test-helpers';
import { propertyCategory, validateConfiguration } from './model-validator';
import { isValidationCompatible } from './validation-rules';

describe('validateConfiguration', () => {
  const json = '{"nome": "a", "idade": 1, "saldo": 2.5, "tags": ["x"], "talvez": null}';
  const schema = analyze(json);

  it('derives type categories from inferred and custom types', () => {
    const config = buildConfig({ properties: { '#/nome': { javaType: 'LocalDate' } } });
    expect(propertyCategory(schema, '#/nome', config)).toBe('temporal');
    expect(propertyCategory(schema, '#/idade', config)).toBe('integer');
    expect(propertyCategory(schema, '#/saldo', config)).toBe('decimal');
    expect(propertyCategory(schema, '#/tags', config)).toBe('collection');
  });

  it('knows which validations fit each type', () => {
    expect(isValidationCompatible('notBlank', 'integer')).toBe(false);
    expect(isValidationCompatible('notBlank', 'string')).toBe(true);
    expect(isValidationCompatible('size', 'collection')).toBe(true);
    expect(isValidationCompatible('min', 'string')).toBe(false);
    expect(isValidationCompatible('notNull', 'object')).toBe(true);
  });

  it('reports incompatible, inconsistent and invalid validations', () => {
    const config = buildConfig({
      properties: {
        '#/idade': { validations: { notBlank: true, min: '10', max: '5' } },
        '#/nome': { validations: { size: { min: 5, max: 2 }, pattern: '([a-z' } },
        '#/saldo': { validations: { min: 'abc' } },
        '#/talvez': { validations: { notNull: true } },
      },
    });
    const messages = validateConfiguration(schema, config).map((d) => `${d.severity}:${d.code}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'warning:incompatible-validation',
        'error:invalid-validation',
        'warning:conflicting-config',
      ]),
    );
    expect(messages.filter((m) => m === 'error:invalid-validation')).toHaveLength(4);
  });

  it('reports invalid custom types, names and options', () => {
    const config = buildConfig({
      java: { basePackage: 'com.example.class', classSuffix: 'D-TO' },
      properties: {
        '#/nome': { javaType: 'List<', tsType: 'string;', generatedName: 'nome completo' },
      },
    });
    const codes = validateConfiguration(schema, config).map((d) => d.code);
    expect(codes.filter((code) => code === 'invalid-type')).toHaveLength(2);
    expect(codes).toContain('invalid-name');
    expect(codes.filter((code) => code === 'invalid-option')).toHaveLength(2);
  });

  it('accepts a valid configuration', () => {
    const config = buildConfig({
      properties: {
        '#/nome': { validations: { notBlank: true, size: { min: 1, max: 10 } } },
        '#/idade': { validations: { min: '0', max: '120' } },
      },
    });
    expect(validateConfiguration(schema, config)).toEqual([]);
  });
});
