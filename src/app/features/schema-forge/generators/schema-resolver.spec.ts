import { fileContent, generate } from '../testing/test-helpers';
import { toModelName } from './schema-resolver';

const names = (json: string, patch: Parameters<typeof generate>[1] = {}): string[] =>
  generate(json, patch).files.map((file) => file.name.replace('.java', ''));

describe('model naming', () => {
  it('keeps the root name exactly as configured', () => {
    expect(names('{"a": 1}', { rootName: 'ClienteDTO' })).toEqual(['ClienteDTO']);
    expect(names('{"a": 1}', { rootName: 'XMLPedido' })).toEqual(['XMLPedido']);
    expect(names('{"a": 1}', { rootName: 'pedido de venda' })).toEqual(['PedidoDeVenda']);
    expect(names('{"a": 1}', { rootName: '' })).toEqual(['Root']);
  });

  it('normalizes only names that are not valid identifiers', () => {
    expect(toModelName('Cliente', 'X')).toBe('Cliente');
    expect(toModelName('cliente', 'X')).toBe('Cliente');
    expect(toModelName('nota-fiscal', 'X')).toBe('NotaFiscal');
    expect(toModelName('123abc', 'X')).toBe('Model123abc');
  });

  it('names nested classes after their properties', () => {
    const json = '{"endereco": {"rua": "a"}, "telefones": [{"ddd": "83"}], "itens": [{"x": 1}]}';
    expect(names(json)).toEqual(['Cliente', 'Endereco', 'Telefone', 'Item']);
  });

  it('does not create redundant names such as ClienteCliente', () => {
    const json = '{"id": 1, "cliente": {"nome": "Maria"}}';
    const result = names(json, { rootName: 'Cliente' });
    expect(result).not.toContain('ClienteCliente');
    expect(result).toEqual(['Cliente', 'Cliente2']);
  });

  it('does not repeat a name the parent already ends with', () => {
    const json = '{"item": {"x": 1}, "pedidoItem": {"item": {"y": 2}}}';
    const result = names(json, { rootName: 'Pedido' });
    expect(result).not.toContain('PedidoItemItem');
    expect(result).toEqual(['Pedido', 'Item', 'PedidoItem', 'Item2']);
  });

  it('still prefixes the parent name when it disambiguates', () => {
    const json = '{"cobranca": {"endereco": {"rua": "a"}}, "entrega": {"endereco": {"cep": "b"}}}';
    expect(names(json)).toContain('EntregaEndereco');
  });

  it('does not repeat the class suffix', () => {
    const result = generate('{"endereco": {"rua": "a"}}', {
      rootName: 'ClienteDTO',
      java: { classSuffix: 'DTO' },
    });
    expect(result.files.map((file) => file.name)).toEqual(['ClienteDTO.java', 'EnderecoDTO.java']);
    expect(fileContent(result, 'ClienteDTO.java')).toContain('private EnderecoDTO endereco;');
  });

  it('applies the configured name of nested models', () => {
    const result = generate('{"endereco": {"rua": "a"}}', {
      models: { '#/endereco': { name: 'EnderecoEntrega' } },
    });
    expect(result.files.map((file) => file.name)).toEqual(['Cliente.java', 'EnderecoEntrega.java']);
  });
});
