/** 1-based, inclusive line span of a property declaration in a generated file. */
export interface DeclarationSpan {
  readonly startLine: number;
  readonly endLine: number;
}

export type GeneratedLanguage = 'java' | 'typescript';

export interface GeneratedFile {
  /** Path inside the export, e.g. `java/com/example/model/ClienteDTO.java`. */
  readonly path: string;
  readonly name: string;
  readonly language: GeneratedLanguage;
  readonly modelId: string;
  readonly content: string;
  /** Declaration of each property (by property id) inside this file. */
  readonly declarations: Readonly<Record<string, DeclarationSpan>>;
}
