/** Half-open character range `[start, end)` inside a source text. */
export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

/** 1-based line/column position, as shown to users and editors. */
export interface TextPosition {
  readonly line: number;
  readonly column: number;
}
