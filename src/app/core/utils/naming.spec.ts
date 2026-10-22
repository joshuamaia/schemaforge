import {
  singularize,
  splitWords,
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSnakeCase,
  uniqueName,
} from './naming';

describe('naming', () => {
  it('splits words from any naming style and removes accents', () => {
    expect(splitWords('firstName')).toEqual(['first', 'name']);
    expect(splitWords('first_name-x y')).toEqual(['first', 'name', 'x', 'y']);
    expect(splitWords('HTTPServer')).toEqual(['http', 'server']);
    expect(splitWords('endereçoEntrega')).toEqual(['endereco', 'entrega']);
  });

  it('converts between conventions', () => {
    expect(toPascalCase('data_criacao')).toBe('DataCriacao');
    expect(toCamelCase('Data-Criação')).toBe('dataCriacao');
    expect(toSnakeCase('dataCriacao')).toBe('data_criacao');
    expect(toKebabCase('OrderItem')).toBe('order-item');
  });

  it.each([
    ['telefones', 'telefone'],
    ['itens', 'item'],
    ['items', 'item'],
    ['valores', 'valor'],
    ['endereços', 'endereço'],
    ['informações', 'informação'],
    ['categories', 'category'],
    ['addresses', 'address'],
    ['status', 'status'],
    ['orderItems', 'orderItem'],
    ['dados', 'dado'],
    ['data', 'data'],
  ])('singularizes %s to %s', (plural, singular) => {
    expect(singularize(plural)).toBe(singular);
  });

  it('creates unique names case-insensitively', () => {
    const used = new Set<string>();
    expect(uniqueName('Item', used)).toBe('Item');
    expect(uniqueName('item', used)).toBe('item2');
    expect(uniqueName('Item', used)).toBe('Item3');
  });
});
