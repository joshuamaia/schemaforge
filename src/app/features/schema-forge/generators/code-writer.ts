import { DeclarationSpan } from '../models/generated-file.model';

/** Small line based writer that tracks indentation and declaration line spans. */
export class CodeWriter {
  private readonly lines: string[] = [];
  private readonly spans: Record<string, DeclarationSpan> = {};
  private level = 0;

  constructor(private readonly indentUnit: string) {}

  /** 1-based number of the next line to be written. */
  get nextLine(): number {
    return this.lines.length + 1;
  }

  line(text = ''): this {
    this.lines.push(text ? this.indentUnit.repeat(this.level) + text : '');
    return this;
  }

  blank(): this {
    if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== '') {
      this.lines.push('');
    }
    return this;
  }

  indent(): this {
    this.level++;
    return this;
  }

  outdent(): this {
    this.level = Math.max(0, this.level - 1);
    return this;
  }

  /** Records that the lines written by `write` declare the given property. */
  declare(propertyId: string, write: () => void): this {
    const startLine = this.nextLine;
    write();
    this.spans[propertyId] = { startLine, endLine: this.lines.length };
    return this;
  }

  get declarations(): Readonly<Record<string, DeclarationSpan>> {
    return this.spans;
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

/** Escapes text for a Java or TypeScript double quoted string literal. */
export function escapeStringLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Splits a description into safe documentation comment lines. */
export function docLines(description: string): string[] {
  return description
    .replace(/\*\//g, '*&#47;')
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
}
