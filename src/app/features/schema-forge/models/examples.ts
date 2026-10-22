export interface JsonExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rootName: string;
  readonly json: string;
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

export const JSON_EXAMPLES: readonly JsonExample[] = [
  {
    id: 'simple-customer',
    title: 'Cliente simples',
    description: 'Strings, números e booleanos.',
    rootName: 'Cliente',
    json: pretty({
      id: 100,
      nome: 'Maria',
      email: 'maria@email.com',
      idade: 34,
      ativo: true,
      cpf: '123.456.789-00',
      limiteCredito: 2500.5,
    }),
  },
  {
    id: 'ecommerce-order',
    title: 'Pedido de e-commerce',
    description: 'Cliente, itens, produtos, quantidades e valores.',
    rootName: 'Pedido',
    json: `{
  "id": 98231,
  "numero": "PED-2026-000123",
  "dataCriacao": "2026-10-22T14:35:00Z",
  "status": "PAGO",
  "cliente": {
    "id": 100,
    "nome": "Maria Souza",
    "email": "maria@email.com",
    "telefone": "83999999999"
  },
  "itens": [
    {
      "produto": {
        "sku": "NB-001",
        "nome": "Notebook Pro 14",
        "categoria": "Informática"
      },
      "quantidade": 1,
      "precoUnitario": 7999.90,
      "desconto": 0.0
    },
    {
      "produto": {
        "sku": "MS-010",
        "nome": "Mouse sem fio",
        "categoria": "Acessórios"
      },
      "quantidade": 2,
      "precoUnitario": 149.90,
      "desconto": 10.5
    }
  ],
  "frete": {
    "cep": "58000-000",
    "valor": 25.00,
    "prazoDias": 5
  },
  "total": 8324.20
}
`,
  },
  {
    id: 'nested-structure',
    title: 'Estrutura aninhada',
    description: 'Múltiplos níveis de objetos e arrays.',
    rootName: 'Empresa',
    json: pretty({
      id: 1,
      razaoSocial: 'Forge Tecnologia LTDA',
      endereco: {
        logradouro: 'Av. Epitácio Pessoa',
        numero: 1500,
        cidade: 'João Pessoa',
        geo: { latitude: -7.115, longitude: -34.861 },
      },
      departamentos: [
        {
          nome: 'Engenharia',
          gerente: { nome: 'Ana', email: 'ana@forge.dev' },
          equipes: [
            {
              nome: 'Plataforma',
              membros: [
                { nome: 'Bruno', cargo: 'Dev Sênior', skills: ['Java', 'Angular'] },
                { nome: 'Carla', cargo: 'Dev Pleno', skills: ['TypeScript'] },
              ],
            },
          ],
        },
        {
          nome: 'Produto',
          gerente: { nome: 'Diego', email: 'diego@forge.dev' },
          equipes: [],
        },
      ],
      tags: ['tecnologia', 'software'],
    }),
  },
  {
    id: 'optional-null',
    title: 'Campos opcionais e nulos',
    description: 'Valores nulos, arrays vazios e tipos mistos que exigem configuração.',
    rootName: 'Usuario',
    json: pretty({
      id: 7,
      nome: 'João',
      apelido: null,
      dataNascimento: '1990-05-17',
      ultimoAcesso: null,
      preferencias: [],
      codigo: 'A-17',
      contatos: [
        { tipo: 'email', valor: 'joao@email.com', principal: true },
        { tipo: 'telefone', valor: '83988887777' },
        { tipo: 'outro', valor: null, observacao: 'sem retorno' },
      ],
      metadados: [1, 'dois', true],
      'first-name': 'João',
      class: 'premium',
    }),
  },
  {
    id: 'invalid-json',
    title: 'JSON inválido',
    description: 'Contém erros de sintaxe para demonstrar a validação.',
    rootName: 'Produto',
    json: `{
  "id": 10,
  "nome": "Teclado mecânico",
  "preco": 349.90
  "estoque": 25,
  "ativo": true,
}
`,
  },
];
