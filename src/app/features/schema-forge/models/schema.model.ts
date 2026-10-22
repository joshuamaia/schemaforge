import { Diagnostic } from '../../../core/models/diagnostic';
import { SourceRange } from '../../../core/models/source-range';

/** Magnitude of integer samples, used to choose between Integer, Long and BigInteger. */
export type IntegerRange = 'int' | 'long' | 'big';

/**
 * Language independent type inferred from JSON samples. Java and TypeScript generators
 * both translate this representation, so interpretation of the JSON happens only once.
 */
export type InferredType =
  | { readonly kind: 'string' }
  | { readonly kind: 'integer'; readonly range: IntegerRange }
  | { readonly kind: 'decimal' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'unknown'; readonly reason: 'null' | 'empty-array' }
  | { readonly kind: 'object'; readonly modelId: string }
  | {
      readonly kind: 'array';
      readonly element: InferredType;
      readonly elementNullable: boolean;
    }
  | { readonly kind: 'union'; readonly variants: readonly InferredType[] };

export interface SchemaProperty {
  /** Stable identifier derived from the JSON path, e.g. `#/telefones/*\/ddd`. */
  readonly id: string;
  readonly modelId: string;
  readonly key: string;
  readonly type: InferredType;
  /** A `null` value was observed. */
  readonly nullable: boolean;
  /** The key is missing from at least one sampled object. */
  readonly optional: boolean;
  readonly presentCount: number;
  readonly sampleCount: number;
  /** Key locations in the JSON input (capped). */
  readonly locations: readonly SourceRange[];
}

export interface SchemaObjectModel {
  /** JSON path pattern of the objects described by this model, e.g. `#/endereco`. */
  readonly id: string;
  readonly parentId: string | null;
  /** Property that holds the objects; `null` for the root model. */
  readonly sourceKey: string | null;
  /** Objects come from array items. */
  readonly fromArray: boolean;
  readonly sampleCount: number;
  readonly properties: readonly SchemaProperty[];
}

export interface SchemaAnalysis {
  readonly rootModelId: string | null;
  /** Models in discovery (pre-order) order, root first. */
  readonly models: readonly SchemaObjectModel[];
  readonly diagnostics: readonly Diagnostic[];
}
