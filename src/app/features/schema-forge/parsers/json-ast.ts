import { SourceRange } from '../../../core/models/source-range';

export type JsonNode =
  JsonObjectNode | JsonArrayNode | JsonStringNode | JsonNumberNode | JsonBooleanNode | JsonNullNode;

export interface JsonObjectNode {
  readonly type: 'object';
  readonly range: SourceRange;
  readonly properties: JsonPropertyNode[];
}

export interface JsonPropertyNode {
  readonly key: string;
  readonly keyRange: SourceRange;
  readonly value: JsonNode;
}

export interface JsonArrayNode {
  readonly type: 'array';
  readonly range: SourceRange;
  readonly items: JsonNode[];
}

export interface JsonStringNode {
  readonly type: 'string';
  readonly range: SourceRange;
  readonly value: string;
}

export interface JsonNumberNode {
  readonly type: 'number';
  readonly range: SourceRange;
  /** Literal text, preserved to keep precision and the integer/decimal distinction. */
  readonly raw: string;
  readonly isInteger: boolean;
}

export interface JsonBooleanNode {
  readonly type: 'boolean';
  readonly range: SourceRange;
  readonly value: boolean;
}

export interface JsonNullNode {
  readonly type: 'null';
  readonly range: SourceRange;
}

export interface JsonSyntaxError {
  readonly message: string;
  readonly offset: number;
  readonly length: number;
  readonly line: number;
  readonly column: number;
}

export type JsonParseResult =
  | { readonly ok: true; readonly root: JsonNode }
  | { readonly ok: false; readonly error: JsonSyntaxError };
