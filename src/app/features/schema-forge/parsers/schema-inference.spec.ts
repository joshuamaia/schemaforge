import { CLIENTE_JSON, analyze } from '../testing/test-helpers';
import { analyzeJson } from './json-analysis';

describe('inferSchema', () => {
  it('identifies primitive types, nested objects and arrays of objects', () => {
    const schema = analyze(CLIENTE_JSON);
    expect(schema.rootModelId).toBe('#');
    expect(schema.models.map((model) => model.id)).toEqual(['#', '#/endereco', '#/telefones/*']);

    const root = schema.models[0];
    const types = Object.fromEntries(root.properties.map((p) => [p.key, p.type]));
    expect(types['id']).toEqual({ kind: 'integer', range: 'int' });
    expect(types['nome']).toEqual({ kind: 'string' });
    expect(types['ativo']).toEqual({ kind: 'boolean' });
    expect(types['endereco']).toEqual({ kind: 'object', modelId: '#/endereco' });
    expect(types['telefones']).toEqual({
      kind: 'array',
      element: { kind: 'object', modelId: '#/telefones/*' },
      elementNullable: false,
    });
  });

  it('keeps textual identifiers such as CPF, CEP and phone as strings', () => {
    const schema = analyze('{"cpf": "12345678900", "cep": "58000000", "telefone": "83999999999"}');
    expect(schema.models[0].properties.every((p) => p.type.kind === 'string')).toBe(true);
  });

  it('distinguishes integers, longs, big integers and decimals', () => {
    const schema = analyze(
      '{"a": 1, "b": 3000000000, "c": 99999999999999999999, "d": 1.5, "e": 10.0, "f": [1, 2.5]}',
    );
    const types = schema.models[0].properties.map((p) => p.type);
    expect(types[0]).toEqual({ kind: 'integer', range: 'int' });
    expect(types[1]).toEqual({ kind: 'integer', range: 'long' });
    expect(types[2]).toEqual({ kind: 'integer', range: 'big' });
    expect(types[3]).toEqual({ kind: 'decimal' });
    expect(types[4]).toEqual({ kind: 'decimal' });
    expect(types[5]).toEqual({
      kind: 'array',
      element: { kind: 'decimal' },
      elementNullable: false,
    });
  });

  it('merges array items and marks properties missing in some items as optional', () => {
    const schema = analyze('{"itens": [{"a": 1, "b": "x"}, {"a": 2}, {"a": null, "c": true}]}');
    const item = schema.models.find((model) => model.id === '#/itens/*');
    expect(item?.sampleCount).toBe(3);
    const props = Object.fromEntries((item?.properties ?? []).map((p) => [p.key, p]));
    expect(props['a'].optional).toBe(false);
    expect(props['a'].nullable).toBe(true);
    expect(props['a'].type).toEqual({ kind: 'integer', range: 'int' });
    expect(props['b'].optional).toBe(true);
    expect(props['c'].optional).toBe(true);
  });

  it('warns about empty arrays without failing', () => {
    const result = analyzeJson('{"tags": []}');
    expect(result.valid).toBe(true);
    const property = result.schema?.models[0].properties[0];
    expect(property?.type).toEqual({
      kind: 'array',
      element: { kind: 'unknown', reason: 'empty-array' },
      elementNullable: false,
    });
    expect(result.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'empty-array'],
    ]);
  });

  it('warns about null-only properties', () => {
    const result = analyzeJson('{"apelido": null}');
    expect(result.schema?.models[0].properties[0].type).toEqual({
      kind: 'unknown',
      reason: 'null',
    });
    expect(result.diagnostics[0].code).toBe('null-only');
    expect(result.diagnostics.every((d) => d.severity !== 'error')).toBe(true);
  });

  it('reports heterogeneous arrays and mixed types as warnings', () => {
    const result = analyzeJson('{"misto": [1, "dois", true], "valor": [{"x": 1}, {"x": "1"}]}');
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain('heterogeneous-array');
    expect(codes).toContain('mixed-types');
    const misto = result.schema?.models[0].properties[0].type;
    expect(misto?.kind === 'array' && misto.element.kind).toBe('union');
  });

  it('flags problematic property names and duplicate keys', () => {
    const result = analyzeJson('{"first-name": "a", "1st": 1, "class": "x", "ok": 1, "ok": 2}');
    const problematic = result.diagnostics.filter((d) => d.code === 'problematic-name');
    expect(problematic).toHaveLength(3);
    expect(result.diagnostics.some((d) => d.code === 'duplicate-key')).toBe(true);
  });

  it('uses array items as the root model when the root is an array', () => {
    const result = analyzeJson('[{"id": 1}, {"id": 2}]');
    expect(result.schema?.rootModelId).toBe('#/*');
    expect(result.diagnostics.some((d) => d.code === 'root-array')).toBe(true);
  });

  it('reports an error for roots that cannot produce models', () => {
    const result = analyzeJson('[1, 2, 3]');
    expect(result.valid).toBe(true);
    expect(result.schema?.rootModelId).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'unsupported-root' });
  });

  it('returns the syntax error for invalid JSON', () => {
    const result = analyzeJson('{"a": 1,,}');
    expect(result.valid).toBe(false);
    expect(result.syntaxError?.line).toBe(1);
    expect(result.diagnostics[0].code).toBe('syntax');
  });

  it('records key locations for highlighting', () => {
    const json = '{"itens": [{"a": 1}, {"a": 2}]}';
    const schema = analyze(json);
    const a = schema.models[1].properties[0];
    expect(a.locations.map((range) => json.slice(range.start, range.end))).toEqual(['"a"', '"a"']);
  });
});
