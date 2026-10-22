import { LineIndex } from '../../../core/utils/text-position';
import {
  JsonArrayNode,
  JsonNode,
  JsonNumberNode,
  JsonObjectNode,
  JsonParseResult,
  JsonPropertyNode,
  JsonStringNode,
} from './json-ast';

const MAX_DEPTH = 2000;

class ParseFailure {
  constructor(
    readonly message: string,
    readonly offset: number,
    readonly length = 1,
  ) {}
}

const enum Char {
  Tab = 9,
  LineFeed = 10,
  CarriageReturn = 13,
  Space = 32,
  Quote = 34,
  Apostrophe = 39,
  Plus = 43,
  Comma = 44,
  Minus = 45,
  Dot = 46,
  Slash = 47,
  Zero = 48,
  Nine = 57,
  Colon = 58,
  UpperE = 69,
  OpenBracket = 91,
  Backslash = 92,
  CloseBracket = 93,
  LowerE = 101,
  OpenBrace = 123,
  CloseBrace = 125,
}

const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

function isDigit(code: number): boolean {
  return code >= Char.Zero && code <= Char.Nine;
}

function isWordChar(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    isDigit(code) ||
    code === 95 ||
    code === 36 ||
    code > 127
  );
}

function describe(text: string, offset: number): string {
  if (offset >= text.length) {
    return 'fim do documento';
  }
  return `'${text[offset]}'`;
}

/**
 * Strict RFC 8259 JSON parser that keeps source positions for every node and reports
 * friendly, located error messages. Number literals keep their raw text.
 */
class JsonParser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly text: string) {}

  parse(): JsonNode {
    this.skipWhitespace();
    if (this.pos >= this.text.length) {
      throw new ParseFailure('O documento está vazio. Informe um objeto ou array JSON.', 0, 0);
    }
    const root = this.parseValue();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      throw new ParseFailure(
        `Conteúdo inesperado após o fim do JSON: ${describe(this.text, this.pos)}. Verifique se há um valor ou chave extra.`,
        this.pos,
      );
    }
    return root;
  }

  private skipWhitespace(): void {
    const text = this.text;
    while (this.pos < text.length) {
      const code = text.charCodeAt(this.pos);
      if (
        code === Char.Space ||
        code === Char.LineFeed ||
        code === Char.CarriageReturn ||
        code === Char.Tab
      ) {
        this.pos++;
      } else if (code === Char.Slash) {
        const next = text[this.pos + 1];
        if (next === '/' || next === '*') {
          throw new ParseFailure('Comentários não são permitidos em JSON.', this.pos, 2);
        }
        return;
      } else {
        return;
      }
    }
  }

  private parseValue(): JsonNode {
    const code = this.text.charCodeAt(this.pos);
    switch (code) {
      case Char.OpenBrace:
        return this.parseObject();
      case Char.OpenBracket:
        return this.parseArray();
      case Char.Quote:
        return this.parseString();
      case Char.Apostrophe:
        throw new ParseFailure(
          'Strings devem usar aspas duplas (") em vez de aspas simples.',
          this.pos,
        );
      case Char.CloseBrace:
      case Char.CloseBracket:
        throw new ParseFailure(
          `Valor esperado, mas foi encontrado '${this.text[this.pos]}'.`,
          this.pos,
        );
      case Char.Comma:
        throw new ParseFailure("Valor esperado antes de ','.", this.pos);
      case Char.Colon:
        throw new ParseFailure("Valor esperado, mas foi encontrado ':'.", this.pos);
    }
    if (Number.isNaN(code)) {
      throw new ParseFailure('Fim inesperado do documento: um valor era esperado.', this.pos, 0);
    }
    if (code === Char.Minus || isDigit(code)) {
      return this.parseNumber();
    }
    return this.parseLiteral();
  }

  private enter(): void {
    if (++this.depth > MAX_DEPTH) {
      throw new ParseFailure(
        `A estrutura excede ${MAX_DEPTH} níveis de aninhamento e não pode ser analisada.`,
        this.pos,
      );
    }
  }

  private parseObject(): JsonObjectNode {
    const start = this.pos;
    this.enter();
    this.pos++;
    const properties: JsonPropertyNode[] = [];
    this.skipWhitespace();
    if (this.text.charCodeAt(this.pos) === Char.CloseBrace) {
      this.pos++;
      this.depth--;
      return { type: 'object', range: { start, end: this.pos }, properties };
    }
    let lastComma = -1;
    for (;;) {
      this.skipWhitespace();
      const code = this.text.charCodeAt(this.pos);
      if (code !== Char.Quote) {
        if (code === Char.CloseBrace && lastComma >= 0) {
          throw new ParseFailure("Vírgula final não é permitida antes de '}'.", lastComma);
        }
        if (code === Char.Apostrophe) {
          throw new ParseFailure(
            'Nomes de propriedades devem usar aspas duplas (") em vez de aspas simples.',
            this.pos,
          );
        }
        if (isWordChar(code)) {
          throw new ParseFailure('Nomes de propriedades devem estar entre aspas duplas.', this.pos);
        }
        if (Number.isNaN(code)) {
          throw new ParseFailure(
            "Fim inesperado do documento: o objeto não foi fechado com '}'.",
            this.pos,
            0,
          );
        }
        throw new ParseFailure(
          `Nome de propriedade esperado, mas foi encontrado ${describe(this.text, this.pos)}.`,
          this.pos,
        );
      }
      const keyNode = this.parseString();
      this.skipWhitespace();
      if (this.text.charCodeAt(this.pos) !== Char.Colon) {
        throw new ParseFailure(
          `Esperado ':' após o nome da propriedade "${keyNode.value}", mas foi encontrado ${describe(this.text, this.pos)}.`,
          this.pos,
        );
      }
      this.pos++;
      this.skipWhitespace();
      const value = this.parseValue();
      properties.push({ key: keyNode.value, keyRange: keyNode.range, value });
      this.skipWhitespace();
      const next = this.text.charCodeAt(this.pos);
      if (next === Char.Comma) {
        lastComma = this.pos;
        this.pos++;
        continue;
      }
      if (next === Char.CloseBrace) {
        this.pos++;
        this.depth--;
        return { type: 'object', range: { start, end: this.pos }, properties };
      }
      if (Number.isNaN(next)) {
        throw new ParseFailure(
          "Fim inesperado do documento: o objeto não foi fechado com '}'.",
          this.pos,
          0,
        );
      }
      if (next === Char.Quote) {
        throw new ParseFailure(
          `Vírgula ausente após o valor da propriedade "${keyNode.value}".`,
          this.pos,
        );
      }
      throw new ParseFailure(
        `Esperado ',' ou '}' após o valor da propriedade "${keyNode.value}", mas foi encontrado ${describe(this.text, this.pos)}.`,
        this.pos,
      );
    }
  }

  private parseArray(): JsonArrayNode {
    const start = this.pos;
    this.enter();
    this.pos++;
    const items: JsonNode[] = [];
    this.skipWhitespace();
    if (this.text.charCodeAt(this.pos) === Char.CloseBracket) {
      this.pos++;
      this.depth--;
      return { type: 'array', range: { start, end: this.pos }, items };
    }
    let lastComma = -1;
    for (;;) {
      this.skipWhitespace();
      if (this.text.charCodeAt(this.pos) === Char.CloseBracket && lastComma >= 0) {
        throw new ParseFailure("Vírgula final não é permitida antes de ']'.", lastComma);
      }
      items.push(this.parseValue());
      this.skipWhitespace();
      const next = this.text.charCodeAt(this.pos);
      if (next === Char.Comma) {
        lastComma = this.pos;
        this.pos++;
        continue;
      }
      if (next === Char.CloseBracket) {
        this.pos++;
        this.depth--;
        return { type: 'array', range: { start, end: this.pos }, items };
      }
      if (Number.isNaN(next)) {
        throw new ParseFailure(
          "Fim inesperado do documento: o array não foi fechado com ']'.",
          this.pos,
          0,
        );
      }
      throw new ParseFailure(
        `Esperado ',' ou ']' entre os itens do array, mas foi encontrado ${describe(this.text, this.pos)}.`,
        this.pos,
      );
    }
  }

  private parseString(): JsonStringNode {
    const text = this.text;
    const start = this.pos;
    this.pos++;
    let value = '';
    let chunkStart = this.pos;
    for (;;) {
      if (this.pos >= text.length) {
        throw new ParseFailure('String não terminada: aspas de fechamento ausentes.', start);
      }
      const code = text.charCodeAt(this.pos);
      if (code === Char.Quote) {
        value += text.slice(chunkStart, this.pos);
        this.pos++;
        return { type: 'string', range: { start, end: this.pos }, value };
      }
      if (code === Char.Backslash) {
        value += text.slice(chunkStart, this.pos);
        value += this.parseEscape();
        chunkStart = this.pos;
        continue;
      }
      if (code < 0x20) {
        if (code === Char.LineFeed || code === Char.CarriageReturn) {
          throw new ParseFailure(
            'String não terminada: quebras de linha não são permitidas dentro de strings (use \\n).',
            start,
            this.pos - start,
          );
        }
        throw new ParseFailure('Caractere de controle não escapado dentro da string.', this.pos);
      }
      this.pos++;
    }
  }

  private parseEscape(): string {
    const escapeStart = this.pos;
    const marker = this.text[this.pos + 1];
    if (marker === 'u') {
      const hex = this.text.slice(this.pos + 2, this.pos + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new ParseFailure(
          'Sequência de escape Unicode inválida: use \\u seguido de 4 dígitos hexadecimais.',
          escapeStart,
          2 + hex.length,
        );
      }
      this.pos += 6;
      return String.fromCharCode(parseInt(hex, 16));
    }
    const resolved = marker === undefined ? undefined : ESCAPES[marker];
    if (resolved === undefined) {
      throw new ParseFailure(
        `Sequência de escape inválida '\\${marker ?? ''}'.`,
        escapeStart,
        marker === undefined ? 1 : 2,
      );
    }
    this.pos += 2;
    return resolved;
  }

  private parseNumber(): JsonNumberNode {
    const text = this.text;
    const start = this.pos;
    let isInteger = true;
    if (text.charCodeAt(this.pos) === Char.Minus) {
      this.pos++;
    }
    const intStart = this.pos;
    if (text.charCodeAt(this.pos) === Char.Zero) {
      this.pos++;
      if (isDigit(text.charCodeAt(this.pos))) {
        throw new ParseFailure('Números não podem ter zeros à esquerda.', intStart);
      }
    } else if (isDigit(text.charCodeAt(this.pos))) {
      while (isDigit(text.charCodeAt(this.pos))) {
        this.pos++;
      }
    } else {
      const word = this.readWord(start + 1);
      throw new ParseFailure(
        word ? `Número inválido '-${word}'.` : "Número inválido: dígito esperado após '-'.",
        start,
        this.pos - start || 1,
      );
    }
    if (text.charCodeAt(this.pos) === Char.Dot) {
      isInteger = false;
      this.pos++;
      if (!isDigit(text.charCodeAt(this.pos))) {
        throw new ParseFailure("Número inválido: dígito esperado após '.'.", this.pos - 1);
      }
      while (isDigit(text.charCodeAt(this.pos))) {
        this.pos++;
      }
    }
    const exp = text.charCodeAt(this.pos);
    if (exp === Char.LowerE || exp === Char.UpperE) {
      isInteger = false;
      this.pos++;
      const sign = text.charCodeAt(this.pos);
      if (sign === Char.Plus || sign === Char.Minus) {
        this.pos++;
      }
      if (!isDigit(text.charCodeAt(this.pos))) {
        throw new ParseFailure('Número inválido: expoente sem dígitos.', start, this.pos - start);
      }
      while (isDigit(text.charCodeAt(this.pos))) {
        this.pos++;
      }
    }
    if (isWordChar(text.charCodeAt(this.pos))) {
      this.readWord(this.pos);
      throw new ParseFailure(
        `Valor inválido '${text.slice(start, this.pos)}'. Textos devem estar entre aspas duplas.`,
        start,
        this.pos - start,
      );
    }
    return {
      type: 'number',
      range: { start, end: this.pos },
      raw: text.slice(start, this.pos),
      isInteger,
    };
  }

  private parseLiteral(): JsonNode {
    const start = this.pos;
    const word = this.readWord(start);
    const range = { start, end: this.pos };
    switch (word) {
      case 'true':
        return { type: 'boolean', range, value: true };
      case 'false':
        return { type: 'boolean', range, value: false };
      case 'null':
        return { type: 'null', range };
      case '':
        throw new ParseFailure(`Caractere inesperado ${describe(this.text, start)}.`, start);
      case 'True':
      case 'False':
      case 'TRUE':
      case 'FALSE':
        throw new ParseFailure(
          `Valor inválido '${word}'. Booleanos em JSON são escritos em minúsculas: true ou false.`,
          start,
          word.length,
        );
      case 'undefined':
      case 'NaN':
      case 'Infinity':
      case 'None':
      case 'NULL':
      case 'Null':
        throw new ParseFailure(
          `Valor inválido '${word}'. Utilize null para valores ausentes.`,
          start,
          word.length,
        );
      default:
        throw new ParseFailure(
          `Valor inválido '${word}'. Textos devem estar entre aspas duplas.`,
          start,
          word.length,
        );
    }
  }

  private readWord(from: number): string {
    let end = from;
    while (end < this.text.length && isWordChar(this.text.charCodeAt(end))) {
      end++;
    }
    this.pos = Math.max(this.pos, end);
    return this.text.slice(from, end);
  }
}

/** Parses JSON text, never throwing: syntax problems are returned as a located error. */
export function parseJson(text: string): JsonParseResult {
  const parser = new JsonParser(text);
  try {
    return { ok: true, root: parser.parse() };
  } catch (error: unknown) {
    const failure =
      error instanceof ParseFailure
        ? error
        : new ParseFailure('A estrutura é profunda demais para ser analisada.', 0);
    const position = new LineIndex(text).positionAt(Math.min(failure.offset, text.length));
    return {
      ok: false,
      error: {
        message: failure.message,
        offset: failure.offset,
        length: failure.length,
        line: position.line,
        column: position.column,
      },
    };
  }
}
