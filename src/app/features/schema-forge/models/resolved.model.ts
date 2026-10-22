import { Diagnostic } from '../../../core/models/diagnostic';
import type { TypeCategory } from '../generators/java/java-types';
import { InferredType } from './schema.model';

/**
 * A validation rule of one property, already checked for compatibility with the property
 * type and for valid parameters. Generators render these rules as they are.
 */
export type ResolvedValidation =
  | { readonly kind: 'notNull' }
  | { readonly kind: 'notBlank' }
  | { readonly kind: 'notEmpty' }
  | { readonly kind: 'email' }
  | { readonly kind: 'size'; readonly min?: number; readonly max?: number }
  | { readonly kind: 'min' | 'max'; readonly value: string; readonly decimal: boolean }
  | { readonly kind: 'pattern'; readonly regexp: string };

/** A property after applying the user configuration to the inferred schema. */
export interface ResolvedProperty {
  readonly id: string;
  readonly modelId: string;
  readonly jsonName: string;
  /** Name explicitly chosen by the user; generators apply their convention otherwise. */
  readonly customName: string | null;
  readonly description: string;
  /**
   * Inferred type with the user type definition applied and object references pointing to
   * canonical model ids.
   */
  readonly type: InferredType;
  /** `false` while the type contains parts that could not be inferred nor were defined. */
  readonly typeDefined: boolean;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly javaType: string | null;
  readonly tsType: string | null;
  /** Category of the Java type, which decides the applicable validations. */
  readonly category: TypeCategory;
  /** Validation rules of this property, in a stable order. */
  readonly validations: readonly ResolvedValidation[];
}

export interface ResolvedModel {
  readonly id: string;
  /** PascalCase name, without the language specific suffix. */
  readonly name: string;
  readonly isRoot: boolean;
  readonly properties: readonly ResolvedProperty[];
}

export type TargetLanguage = 'java' | 'typescript';

export interface ResolvedSchema {
  readonly language: TargetLanguage;
  readonly rootModelId: string | null;
  /** Canonical models that must be generated, in discovery order. */
  readonly models: readonly ResolvedModel[];
  /** Every model id (aliases included) mapped to its canonical model id. */
  readonly canonicalModels: ReadonlyMap<string, string>;
  /** Property ids of aliased (structurally identical) models mapped to canonical property ids. */
  readonly canonicalProperties: ReadonlyMap<string, string>;
  readonly modelNames: ReadonlyMap<string, string>;
  readonly diagnostics: readonly Diagnostic[];
}
