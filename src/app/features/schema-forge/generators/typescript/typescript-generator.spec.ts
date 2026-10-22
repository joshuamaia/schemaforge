import { CLIENTE_JSON, fileContent, generate } from '../../testing/test-helpers';
import { isValidTsType } from './typescript-types';

describe('TypeScript generation', () => {
  it('generates one interface per model with type imports', () => {
    const result = generate(CLIENTE_JSON, { format: 'typescript' });
    expect(result.files.map((file) => file.path)).toEqual([
      'typescript/cliente.model.ts',
      'typescript/endereco.model.ts',
      'typescript/telefone.model.ts',
    ]);
    expect(fileContent(result, 'cliente.model.ts')).toBe(
      [
        "import type { Endereco } from './endereco.model';",
        "import type { Telefone } from './telefone.model';",
        '',
        'export interface Cliente {',
        '  id: number;',
        '  nome: string;',
        '  email: string;',
        '  ativo: boolean;',
        '  endereco: Endereco;',
        '  telefones: Telefone[];',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('treats optional and nullable as different concepts', () => {
    const result = generate('{"itens": [{"a": 1, "b": null, "c": "x"}, {"a": 2, "b": "y"}]}', {
      format: 'typescript',
    });
    const item = fileContent(result, 'item.model.ts');
    expect(item).toContain('  a: number;');
    expect(item).toContain('  b: string | null;');
    expect(item).toContain('  c?: string;');
  });

  it('applies required and nullable overrides', () => {
    const result = generate('{"a": 1}', {
      format: 'typescript',
      properties: { '#/a': { required: false, nullable: true } },
    });
    expect(fileContent(result, 'cliente.model.ts')).toContain('  a?: number | null;');
  });

  it('preserves original JSON names, quoting invalid identifiers', () => {
    const result = generate('{"first-name": "a", "class": "b", "1st": 1, "ok": true}', {
      format: 'typescript',
    });
    const content = fileContent(result, 'cliente.model.ts');
    expect(content).toContain("  'first-name': string;");
    expect(content).toContain('  class: string;');
    expect(content).toContain("  '1st': number;");
    expect(content).toContain('  ok: boolean;');
  });

  it('maps empty, null-only, mixed and nested arrays', () => {
    const result = generate(
      '{"vazio": [], "nulo": null, "misto": [1, "a"], "matriz": [[1, 2]], "talvez": ["a", null]}',
      { format: 'typescript' },
    );
    const content = fileContent(result, 'cliente.model.ts');
    expect(content).toContain('  vazio: unknown[];');
    expect(content).toContain('  nulo: unknown;');
    expect(content).toContain('  misto: (string | number)[];');
    expect(content).toContain('  matriz: number[][];');
    expect(content).toContain('  talvez: (string | null)[];');
  });

  it('uses custom TypeScript types and ignores invalid ones', () => {
    const result = generate('{"data": "2020-01-01", "x": 1}', {
      format: 'typescript',
      properties: { '#/data': { tsType: 'Date' }, '#/x': { tsType: 'number; evil()' } },
    });
    const content = fileContent(result, 'cliente.model.ts');
    expect(content).toContain('  data: Date;');
    expect(content).toContain('  x: number;');
    expect(isValidTsType('Record<string, number>')).toBe(true);
    expect(isValidTsType('{ a: 1 }')).toBe(false);
  });

  it('avoids duplicate interfaces for identical structures', () => {
    const result = generate(
      '{"cobranca": {"endereco": {"rua": "a"}}, "entrega": {"endereco": {"rua": "b"}}}',
      { format: 'typescript' },
    );
    expect(result.files.map((file) => file.name)).toEqual([
      'cliente.model.ts',
      'cobranca.model.ts',
      'endereco.model.ts',
      'entrega.model.ts',
    ]);
  });

  it('gives distinct names to different structures with the same name', () => {
    const result = generate(
      '{"cobranca": {"endereco": {"rua": "a"}}, "entrega": {"endereco": {"cep": "b"}}}',
      { format: 'typescript' },
    );
    expect(result.files.map((file) => file.name)).toContain('entrega-endereco.model.ts');
    expect(fileContent(result, 'entrega.model.ts')).toContain('endereco: EntregaEndereco;');
  });

  it('avoids interface names that shadow global types', () => {
    const result = generate('{"error": {"code": 1}}', { format: 'typescript' });
    expect(result.files.map((file) => file.name)).toContain('error-model.model.ts');
    expect(fileContent(result, 'cliente.model.ts')).toContain('error: ErrorModel;');
  });

  it('supports readonly and camelCase options with descriptions', () => {
    const base = generate('{"nome_completo": "a"}', {
      format: 'typescript',
      properties: { '#/nome_completo': { description: 'Nome do cliente' } },
    });
    expect(fileContent(base, 'cliente.model.ts')).toContain(
      '  /** Nome do cliente */\n  nome_completo: string;',
    );
  });
});
