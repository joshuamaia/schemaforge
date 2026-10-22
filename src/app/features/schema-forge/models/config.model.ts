/**
 * User customizations kept apart from the input JSON. Property and model settings are keyed
 * by the stable path identifiers produced by the schema inference.
 */

export type OutputFormat = 'java-class' | 'java-record' | 'java-lombok' | 'typescript';

export type OptionalHandling = 'wrapper' | 'primitive-required' | 'optional';

export type JavaFieldNaming = 'camelCase' | 'snake_case' | 'original';

export interface LombokOptions {
  readonly getter: boolean;
  readonly setter: boolean;
  readonly data: boolean;
  readonly noArgsConstructor: boolean;
  readonly allArgsConstructor: boolean;
  readonly builder: boolean;
}

export interface JavaOptions {
  readonly basePackage: string;
  readonly classSuffix: string;
  readonly integerType: 'Integer' | 'Long';
  readonly decimalType: 'BigDecimal' | 'Double';
  readonly optionalHandling: OptionalHandling;
  readonly fieldNaming: JavaFieldNaming;
  readonly jakartaValidation: boolean;
  /** Adds `@Valid` to nested objects so validation cascades. */
  readonly cascadeValidation: boolean;
  /** Adds `@JsonProperty` when the Java name differs from the JSON name. */
  readonly jacksonAnnotations: boolean;
  readonly defaultConstructor: boolean;
  readonly allArgsConstructor: boolean;
  readonly lombok: LombokOptions;
}

export interface TypeScriptOptions {
  readonly propertyNaming: 'original' | 'camelCase';
  readonly readonlyProperties: boolean;
}

export interface SizeRule {
  readonly min?: number;
  readonly max?: number;
}

export interface ValidationConfig {
  readonly notNull?: boolean;
  readonly notBlank?: boolean;
  readonly notEmpty?: boolean;
  readonly email?: boolean;
  readonly size?: SizeRule;
  /** Numeric bound; rendered as `@Min` for integers and `@DecimalMin` for decimals. */
  readonly min?: string;
  readonly max?: string;
  readonly pattern?: string;
}

/**
 * Language independent type chosen by the user for values that could not be inferred
 * (only `null`, empty arrays, mixed types). Applied to the intermediate model, so Java and
 * TypeScript follow it; for arrays it defines the element type.
 */
export type TypeOverride = 'string' | 'integer' | 'decimal' | 'boolean';

export const TYPE_OVERRIDE_LABELS: Readonly<Record<TypeOverride, string>> = {
  string: 'Texto',
  integer: 'Inteiro',
  decimal: 'Decimal',
  boolean: 'Booleano',
};

export interface PropertyConfig {
  readonly generatedName?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly nullable?: boolean;
  readonly included?: boolean;
  readonly typeOverride?: TypeOverride;
  readonly javaType?: string;
  readonly tsType?: string;
  readonly validations?: ValidationConfig;
}

export interface ModelConfig {
  readonly name?: string;
}

export interface ProjectConfig {
  readonly rootName: string;
  readonly format: OutputFormat;
  readonly java: JavaOptions;
  readonly typescript: TypeScriptOptions;
  readonly models: Readonly<Record<string, ModelConfig>>;
  readonly properties: Readonly<Record<string, PropertyConfig>>;
}

export const DEFAULT_LOMBOK_OPTIONS: LombokOptions = {
  getter: false,
  setter: false,
  data: true,
  noArgsConstructor: true,
  allArgsConstructor: true,
  builder: true,
};

export const DEFAULT_JAVA_OPTIONS: JavaOptions = {
  basePackage: 'com.example.model',
  classSuffix: '',
  integerType: 'Long',
  decimalType: 'BigDecimal',
  optionalHandling: 'wrapper',
  fieldNaming: 'camelCase',
  jakartaValidation: true,
  cascadeValidation: true,
  jacksonAnnotations: true,
  defaultConstructor: true,
  allArgsConstructor: false,
  lombok: DEFAULT_LOMBOK_OPTIONS,
};

export const DEFAULT_TYPESCRIPT_OPTIONS: TypeScriptOptions = {
  propertyNaming: 'original',
  readonlyProperties: false,
};

export const DEFAULT_ROOT_NAME = 'Root';

export function createDefaultConfig(): ProjectConfig {
  return {
    rootName: DEFAULT_ROOT_NAME,
    format: 'java-class',
    java: DEFAULT_JAVA_OPTIONS,
    typescript: DEFAULT_TYPESCRIPT_OPTIONS,
    models: {},
    properties: {},
  };
}

export const OUTPUT_FORMAT_LABELS: Readonly<Record<OutputFormat, string>> = {
  'java-class': 'Java Class',
  'java-record': 'Java Record',
  'java-lombok': 'Java + Lombok',
  typescript: 'TypeScript',
};

export function isJavaFormat(format: OutputFormat): boolean {
  return format !== 'typescript';
}
