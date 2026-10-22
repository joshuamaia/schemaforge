import { parseJson } from './json-parser';
import { formatJsonText } from './json-formatter';

describe('parseJson', () => {
  it('parses a valid document with positions', () => {
    const result = parseJson('{\n  "id": 1,\n  "tags": ["a", null, true]\n}');
    expect(result.ok).toBe(true);
    if (!result.ok || result.root.type !== 'object') {
      throw new Error('expected object');
    }
    expect(result.root.properties.map((p) => p.key)).toEqual(['id', 'tags']);
    expect(result.root.properties[0].keyRange).toEqual({ start: 4, end: 8 });
    const tags = result.root.properties[1].value;
    expect(tags.type).toBe('array');
  });

  it('keeps number literals and the integer/decimal distinction', () => {
    const result = parseJson('[10, 10.0, -3e2, 12345678901234567890]');
    if (!result.ok || result.root.type !== 'array') {
      throw new Error('expected array');
    }
    const numbers = result.root.items.map((item) => (item.type === 'number' ? item : null));
    expect(numbers.map((n) => n?.raw)).toEqual(['10', '10.0', '-3e2', '12345678901234567890']);
    expect(numbers.map((n) => n?.isInteger)).toEqual([true, false, false, true]);
  });

  it('decodes escapes in strings', () => {
    const result = parseJson('{"a": "linha\\n\\"aspas\\" \\u00e9"}');
    if (!result.ok || result.root.type !== 'object') {
      throw new Error('expected object');
    }
    const value = result.root.properties[0].value;
    expect(value.type === 'string' && value.value).toBe('linha\n"aspas" é');
  });

  const invalidCases: Array<[string, string, number, number]> = [
    ['{\n  "a": 1\n  "b": 2\n}', 'Vírgula ausente', 3, 3],
    ['{"a": 1,}', 'Vírgula final', 1, 8],
    ['[1, 2,]', 'Vírgula final', 1, 6],
    ["{'a': 1}", 'aspas duplas', 1, 2],
    ['{a: 1}', 'entre aspas duplas', 1, 2],
    ['{"a": "texto}', 'String não terminada', 1, 7],
    ['{"a": tru}', "Valor inválido 'tru'", 1, 7],
    ['{"a": 01}', 'zeros à esquerda', 1, 7],
    ['{"a": 1} x', 'Conteúdo inesperado', 1, 10],
    ['{"a": [1, 2}', "Esperado ',' ou ']'", 1, 12],
    ['{"a": 1', "não foi fechado com '}'", 1, 8],
    ['// comentário\n{}', 'Comentários', 1, 1],
    ['{"a": True}', 'minúsculas', 1, 7],
    ['{"a": "\\x"}', 'escape inválida', 1, 8],
    ['', 'vazio', 1, 1],
  ];

  it.each(invalidCases)('reports %j with line and column', (text, message, line, column) => {
    const result = parseJson(text);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain(message);
    expect(result.error.line).toBe(line);
    expect(result.error.column).toBe(column);
  });

  it('rejects excessive nesting without throwing', () => {
    const deep = '['.repeat(5000) + ']'.repeat(5000);
    const result = parseJson(deep);
    expect(result.ok).toBe(false);
  });
});

describe('formatJsonText', () => {
  it('pretty prints preserving literals', () => {
    const formatted = formatJsonText('{"a":10.0,"b":[1,{"c":"\\u00e9"}],"d":{},"e":[]}');
    expect(formatted).toBe(
      [
        '{',
        '  "a": 10.0,',
        '  "b": [',
        '    1,',
        '    {',
        '      "c": "\\u00e9"',
        '    }',
        '  ],',
        '  "d": {},',
        '  "e": []',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('returns null for invalid JSON', () => {
    expect(formatJsonText('{"a":')).toBeNull();
  });

  it('is idempotent', () => {
    const once = formatJsonText('{"a":[1,2,{"b":null}]}') as string;
    expect(formatJsonText(once)).toBe(once);
  });
});
