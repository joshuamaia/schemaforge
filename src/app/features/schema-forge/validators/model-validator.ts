import { Diagnostic } from '../../../core/models/diagnostic';
import { JAVA_RESERVED_WORDS, isSimpleIdentifier } from '../../../core/utils/naming';
import { ProjectConfig, isJavaFormat } from '../models/config.model';
import { SchemaAnalysis } from '../models/schema.model';
import { isValidJavaPackage } from '../generators/java/java-generator';
import { TypeCategory, isValidJavaType, javaTypeCategory } from '../generators/java/java-types';
import { applyTypeOverride } from '../generators/schema-resolver';
import { isValidTsType } from '../generators/typescript/typescript-types';
import {
  VALIDATION_RULES,
  activeValidationKeys,
  isValidBoundValue,
  isValidPattern,
  isValidationCompatible,
} from './validation-rules';

/**
 * Category of the Java type a property will have (custom Java type, or the inferred type with
 * the user type definition applied). Decides which validations are compatible.
 */
export function propertyCategory(
  analysis: SchemaAnalysis,
  propertyId: string,
  config: ProjectConfig,
): TypeCategory {
  const property = analysis.models
    .flatMap((model) => model.properties)
    .find((candidate) => candidate.id === propertyId);
  if (!property) {
    return 'other';
  }
  const settings = config.properties[propertyId] ?? {};
  const custom = settings.javaType?.trim();
  return javaTypeCategory(
    applyTypeOverride(property.type, settings.typeOverride),
    custom && isValidJavaType(custom) ? custom : null,
  );
}

/** Validates the generation options and per-property configuration. */
export function validateConfiguration(
  analysis: SchemaAnalysis | null,
  config: ProjectConfig,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const javaOutput = isJavaFormat(config.format);

  if (javaOutput && !isValidJavaPackage(config.java.basePackage)) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-option',
      message: `O package "${config.java.basePackage}" é inválido; os arquivos serão gerados sem declaração de package.`,
    });
  }
  const suffix = config.java.classSuffix.trim();
  if (javaOutput && suffix && !/^[A-Za-z0-9_$]+$/.test(suffix)) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-option',
      message: `O sufixo "${suffix}" contém caracteres inválidos, que serão removidos.`,
    });
  }
  if (!config.rootName.trim()) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-name',
      message: 'O nome do modelo principal está vazio; será utilizado "Root".',
    });
  }
  if (!analysis) {
    return diagnostics;
  }

  for (const model of analysis.models) {
    for (const property of model.properties) {
      const settings = config.properties[property.id];
      if (!settings || settings.included === false) {
        continue;
      }
      const label = `"${property.key}"`;
      const report = (
        severity: Diagnostic['severity'],
        code: Diagnostic['code'],
        message: string,
      ): void => {
        diagnostics.push({
          severity,
          code,
          message,
          propertyId: property.id,
          range: property.locations[0],
        });
      };

      const name = settings.generatedName?.trim();
      if (name && (!isSimpleIdentifier(name) || JAVA_RESERVED_WORDS.has(name))) {
        report(
          'warning',
          'invalid-name',
          `O nome gerado "${name}" de ${label} não é um identificador válido e será ajustado.`,
        );
      }
      const javaType = settings.javaType?.trim();
      if (javaType && !isValidJavaType(javaType)) {
        report(
          'error',
          'invalid-type',
          `O tipo Java "${javaType}" de ${label} é inválido; o tipo inferido será utilizado.`,
        );
      }
      const tsType = settings.tsType?.trim();
      if (tsType && !isValidTsType(tsType)) {
        report(
          'error',
          'invalid-type',
          `O tipo TypeScript "${tsType}" de ${label} é inválido; o tipo inferido será utilizado.`,
        );
      }

      const validations = settings.validations ?? {};
      const category = propertyCategory(analysis, property.id, config);
      for (const key of activeValidationKeys(validations)) {
        if (!isValidationCompatible(key, category)) {
          const rule = VALIDATION_RULES.find((candidate) => candidate.key === key);
          report(
            'warning',
            'incompatible-validation',
            `${rule?.label ?? key} não é compatível com o tipo de ${label} e não será gerada.`,
          );
        }
      }
      const nullable = settings.nullable ?? property.nullable;
      if (validations.notNull && nullable) {
        report(
          'warning',
          'conflicting-config',
          `${label} permite nulo, mas possui @NotNull. Revise a configuração.`,
        );
      }
      const size = validations.size;
      if (size) {
        if ((size.min ?? 0) < 0 || (size.max ?? 0) < 0) {
          report(
            'error',
            'invalid-validation',
            `@Size de ${label} não aceita valores negativos e não será gerada.`,
          );
        }
        if (size.min !== undefined && size.max !== undefined && size.min > size.max) {
          report(
            'error',
            'invalid-validation',
            `@Size de ${label}: o mínimo é maior que o máximo; a anotação não será gerada.`,
          );
        }
      }
      const boundsApply = category === 'integer' || category === 'decimal';
      for (const bound of ['min', 'max'] as const) {
        const value = validations[bound]?.trim();
        if (value && boundsApply && !isValidBoundValue(value, category)) {
          report(
            'error',
            'invalid-validation',
            `O valor "${value}" de @${bound === 'min' ? 'Min' : 'Max'} em ${label} não é um número ${category === 'integer' ? 'inteiro ' : ''}válido; a anotação não será gerada.`,
          );
        }
      }
      const min = validations.min?.trim();
      const max = validations.max?.trim();
      if (
        min &&
        max &&
        boundsApply &&
        isValidBoundValue(min, category) &&
        isValidBoundValue(max, category) &&
        Number(min) > Number(max)
      ) {
        report('error', 'invalid-validation', `${label}: o valor mínimo é maior que o máximo.`);
      }
      if (validations.pattern && !isValidPattern(validations.pattern)) {
        report(
          'error',
          'invalid-validation',
          `A expressão regular de @Pattern em ${label} é inválida; a anotação não será gerada.`,
        );
      }
    }
  }
  return diagnostics;
}
