import { SourceRange } from './source-range';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'syntax'
  | 'empty-document'
  | 'unsupported-root'
  | 'root-array'
  | 'empty-array'
  | 'null-only'
  | 'mixed-types'
  | 'heterogeneous-array'
  | 'problematic-name'
  | 'duplicate-key'
  | 'incompatible-validation'
  | 'invalid-validation'
  | 'conflicting-config'
  | 'invalid-type'
  | 'invalid-name'
  | 'name-conflict'
  | 'root-name-conflict'
  | 'invalid-option';

/** A problem found in the input JSON or in the generation configuration. */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  readonly message: string;
  /** Property the diagnostic refers to, when applicable. */
  readonly propertyId?: string;
  /** Location in the JSON input, when applicable. */
  readonly range?: SourceRange;
}
