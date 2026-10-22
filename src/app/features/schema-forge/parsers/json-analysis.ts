import { Diagnostic } from '../../../core/models/diagnostic';
import { SchemaAnalysis } from '../models/schema.model';
import { JsonSyntaxError } from './json-ast';
import { parseJson } from './json-parser';
import { inferSchema } from './schema-inference';

export interface JsonAnalysisResult {
  /** `true` when the JSON is syntactically valid. */
  readonly valid: boolean;
  readonly syntaxError: JsonSyntaxError | null;
  readonly schema: SchemaAnalysis | null;
  /** Syntax and structure diagnostics of the input JSON. */
  readonly diagnostics: readonly Diagnostic[];
}

export const EMPTY_ANALYSIS: JsonAnalysisResult = {
  valid: false,
  syntaxError: null,
  schema: null,
  diagnostics: [],
};

/** Parses and analyzes JSON text. Pure and serializable, so it can also run in a worker. */
export function analyzeJson(text: string): JsonAnalysisResult {
  if (text.trim().length === 0) {
    return EMPTY_ANALYSIS;
  }
  const parsed = parseJson(text);
  if (!parsed.ok) {
    const { error } = parsed;
    return {
      valid: false,
      syntaxError: error,
      schema: null,
      diagnostics: [
        {
          severity: 'error',
          code: 'syntax',
          message: error.message,
          range: { start: error.offset, end: error.offset + Math.max(error.length, 1) },
        },
      ],
    };
  }
  const schema = inferSchema(parsed.root);
  return { valid: true, syntaxError: null, schema, diagnostics: schema.diagnostics };
}
