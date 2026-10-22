# SchemaForge — JSON to Code Generator

SchemaForge transforma estruturas JSON em modelos **Java** (Class, Record, Class com Lombok) e
**interfaces TypeScript**, com visualização hierárquica, edição visual de propriedades,
validações Jakarta configuráveis, geração em tempo real e exportação em ZIP.

Tudo roda **no navegador**: não há backend, banco de dados nem chamadas a serviços externos.

## Requisitos

- Node.js 22+ (testado com Node 24) e npm 11
- Opcional: JDK 21+ no `PATH` para os testes de compilação Java (`javac`)

## Scripts

| Comando                | Descrição                                                                      |
| ---------------------- | ------------------------------------------------------------------------------ |
| `npm install`          | Instala as dependências                                                        |
| `npm start`            | Servidor de desenvolvimento em `http://localhost:4200`                         |
| `npm run build`        | Build de produção em `dist/schemaforge/browser` (site estático)                |
| `npm test`             | Testes unitários (Vitest via `ng test`)                                        |
| `npm run test:compile` | Compila o código gerado com `javac --release 21` e com o compilador TypeScript |
| `npm run test:all`     | Executa as duas suítes                                                         |
| `npm run format`       | Formata o código com Prettier                                                  |

O resultado de `npm run build` é um conjunto de arquivos estáticos e pode ser publicado em
qualquer servidor de arquivos (GitHub Pages, Netlify, Nginx…).

## Como usar

1. **Cole, digite ou importe** um JSON no painel _JSON de entrada_ (ou escolha um dos exemplos em
   ✨). JSON válido colado é formatado automaticamente; erros aparecem no editor e na lista de
   problemas com linha, coluna e descrição.
2. Ajuste o **modelo principal** (sugerido como `Root`) no painel _Estrutura visual_. O nome é
   usado exatamente como digitado quando é um identificador válido (`ClienteDTO` continua
   `ClienteDTO`); textos com espaços ou acentos são convertidos (`pedido de venda` →
   `PedidoDeVenda`).
3. Clique em uma propriedade da árvore para abrir o editor de propriedades, organizado em abas:
   - **Identificação**: nome original, nome gerado, tipo de dado, descrição e nome do modelo
     aninhado;
   - **Configurações**: obrigatório, permitir nulo, incluir na geração e tipos Java/TypeScript
     personalizados (ex.: `LocalDate`);
   - **Validações**: `@NotNull`, `@NotBlank`, `@NotEmpty`, `@Email`, `@Size`, `@Min`/`@Max` (ou
     `@DecimalMin`/`@DecimalMax` em decimais) e `@Pattern`. Só as regras compatíveis com o tipo
     do campo ficam disponíveis (ex.: `@NotBlank` fica bloqueado em número). A aba mostra
     quantas regras estão ativas.

   Quando o tipo não pode ser inferido (apenas `null`, array vazio ou tipos mistos), a árvore
   mostra **definir tipo** e o editor exibe, em qualquer aba, um seletor de tipo (Texto, Inteiro,
   Decimal, Booleano; para arrays, o tipo dos itens). Veja
   [Tipos não inferidos](#tipos-não-inferidos).

4. Escolha o formato de saída (**Java Class**, **Java Record**, **Java + Lombok**,
   **TypeScript**). O código é atualizado a cada alteração.
5. Copie ou baixe o arquivo selecionado, ou exporte tudo em **ZIP**.

### Validações Jakarta

- Para configurar as validações de um campo, use o botão de escudo 🛡 na linha da propriedade
  (aparece ao passar o mouse) ou abra a propriedade e escolha a aba **Validações**.
- Com um formato Java selecionado, o interruptor **Jakarta Validation** fica logo abaixo dos
  botões de formato, junto com a quantidade de campos que têm validações. Desligado, nenhuma
  anotação de validação é gerada, mas as regras configuradas são mantidas.
- As validações só aparecem na saída Java; em TypeScript elas são ignoradas.
- As regras de cada propriedade ficam no modelo intermediário e são as mesmas em **Java Class**,
  **Java Record** e **Java + Lombok**: trocar o formato não perde nenhuma configuração.
- Nada é adicionado automaticamente: ligar o Jakarta Validation **não** gera `@NotNull` nem
  `@NotBlank` sozinho, e o nome do campo não sugere regras (`email` não ganha `@Email`).
- A única anotação automática é `@Valid`, em objetos aninhados e em coleções de objetos
  (`List<Telefone>`), para validar em cascata. Ela pode ser desligada em ⚙ › _@Valid em
  aninhados_.
- `@Valid` e `@NotNull` são independentes: `@Valid` valida o conteúdo do objeto, `@NotNull`
  exige que ele exista. Um campo pode ter as duas.
- Regras com parâmetros inválidos (ex.: `@Min` com `1.5` num inteiro, `@Size` com mínimo maior
  que o máximo, expressão regular inválida) aparecem como erro na lista de problemas e **não**
  são geradas, para que o código continue compilando.
- Só os imports das anotações realmente usadas são gerados.

| Regra             | Tipos compatíveis                 | Anotação gerada                              |
| ----------------- | --------------------------------- | -------------------------------------------- |
| Valor obrigatório | qualquer                          | `@NotNull`                                   |
| Texto não vazio   | texto                             | `@NotBlank`                                  |
| Não vazio         | texto, coleções                   | `@NotEmpty`                                  |
| E-mail            | texto                             | `@Email`                                     |
| Tamanho           | texto, coleções                   | `@Size(min = …, max = …)`                    |
| Mínimo / máximo   | inteiros                          | `@Min(…)` / `@Max(…)` (sufixo `L` se `long`) |
| Mínimo / máximo   | decimais (`BigDecimal`, `Double`) | `@DecimalMin("…")` / `@DecimalMax("…")`      |
| Expressão regular | texto                             | `@Pattern(regexp = "…")`                     |

A compatibilidade segue o tipo Java final do campo: um tipo Java personalizado (ex.: `String`
num campo numérico) ou a definição de tipo muda as regras disponíveis.

### Tipos não inferidos

Campos com apenas `null`, arrays sempre vazios ou tipos mistos geram um aviso e aparecem na árvore
com **definir tipo**. Ao escolher o tipo no editor da propriedade, ele vale para Java e
TypeScript (ex.: _Texto_ → `String`/`string`; num array vazio, _Inteiro_ → `List<Long>`/`number[]`),
o aviso desaparece e as validações compatíveis passam a ficar disponíveis.

Sem definição, o campo é gerado como `Object` (Java) ou `unknown` (TypeScript). Ao exportar o ZIP
com campos ainda sem tipo, o SchemaForge abre o primeiro deles para definição e oferece
**Exportar assim** para seguir mesmo assim.

### Opções de geração (⚙)

A engrenagem no painel _Código gerado_ abre as opções do formato atual: package base, sufixo de
classe, tipos para inteiros e decimais, tratamento de opcionais, nomenclatura dos campos,
`@Valid` em aninhados, `@JsonProperty`, construtores (Java Class), anotações Lombok
(Java + Lombok) e nomenclatura/`readonly` (TypeScript).

Ao selecionar uma propriedade, ela é destacada simultaneamente no JSON original, na árvore e na
declaração do código gerado — inclusive ao alternar o formato de saída.

### Exemplos incluídos

| Exemplo                  | Demonstra                                                |
| ------------------------ | -------------------------------------------------------- |
| Cliente simples          | strings, números, booleanos, CPF como texto              |
| Pedido de e-commerce     | cliente, itens, produtos, quantidades e valores decimais |
| Estrutura aninhada       | vários níveis de objetos e arrays                        |
| Campos opcionais e nulos | nulos, arrays vazios, tipos mistos, nomes problemáticos  |
| JSON inválido            | mensagens de erro de sintaxe                             |

### Atalhos de teclado

- Árvore: `↑`/`↓` navegam, `→`/`←` expandem/recolhem, `Enter` abre o editor da propriedade,
  `Delete` inclui/exclui da geração.
- Divisores entre painéis: `←`/`→` (com `Shift` para passos maiores); duplo clique restaura.
- Editor: `Ctrl+M` alterna o uso de `Tab` para navegar entre controles.

## Regras de inferência

| JSON                    | Java                                                               | TypeScript                                    |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| string                  | `String` (datas continuam `String`)                                | `string`                                      |
| inteiro                 | `Long` ou `Integer` (configurável); `Long`/`BigInteger` se exceder | `number`                                      |
| decimal (`1.5`, `10.0`) | `BigDecimal` ou `Double` (configurável)                            | `number`                                      |
| boolean                 | `Boolean`                                                          | `boolean`                                     |
| array                   | `List<T>`                                                          | `T[]`                                         |
| objeto                  | classe/record específico                                           | interface específica                          |
| só `null` / array vazio | `Object` + aviso (ou o tipo definido)                              | `unknown` + aviso (ou o tipo definido)        |
| tipos mistos            | `Object` + aviso (ou o tipo definido)                              | união (`string \| number`) ou o tipo definido |

- Arrays de objetos são mesclados: propriedades ausentes em alguns itens viram **opcionais**;
  valores `null` tornam a propriedade **anulável** (conceitos distintos: `?` vs `| null`).
- Nomes de classes derivam do nome da propriedade (singularizado para arrays:
  `telefones` → `Telefone`), nunca do valor. Estruturas idênticas com o mesmo nome são geradas
  uma única vez.
- Em caso de conflito, o nome do modelo pai é usado como prefixo quando acrescenta informação
  (`cobranca.endereco` e `entrega.endereco` → `Endereco` e `EntregaEndereco`). Prefixos
  redundantes não são criados: um objeto `cliente` dentro do modelo principal `Cliente` vira
  `Cliente2`, e não `ClienteCliente`. Qualquer modelo aninhado pode ser renomeado no editor da
  propriedade.
- O sufixo de classe não é repetido: modelo `ClienteDTO` com sufixo `DTO` gera `ClienteDTO`.
- Nada é presumido pelo nome do campo: `email` não ganha `@Email`, valores não viram dinheiro e
  CPF/CEP/telefone continuam texto. Validações só existem se forem configuradas.
- Datas permanecem `String`; use o tipo personalizado para `LocalDate`, `LocalDateTime`,
  `OffsetDateTime` etc. (o import é adicionado automaticamente).

## Arquitetura

```text
src/app/
├── core/                      # modelos, serviços e utilitários transversais
│   ├── models/                # Diagnostic, SourceRange
│   ├── services/              # tema, armazenamento local, notificações
│   └── utils/                 # nomenclatura, ZIP (CRC-32), posições de texto
├── features/schema-forge/
│   ├── parsers/               # parser JSON com posições, formatador, inferência de schema
│   ├── models/                # modelo intermediário, configuração, arquivos gerados, exemplos
│   ├── generators/            # resolvedor + geradores puros
│   │   ├── java/              # Class, Record, Lombok, Jakarta Validation
│   │   └── typescript/        # interfaces
│   ├── validators/            # regras de validação e validação da configuração
│   ├── services/              # store (Signals), análise em Web Worker, exportação
│   ├── editors/               # integração com o Monaco Editor (carregamento lazy)
│   └── components/            # painéis, árvore, editor de propriedades, barra de status
└── shared/                    # ícones (Lucide), divisor redimensionável, árvore de arquivos
```

Fluxo de dados:

```text
jsonText ──(debounce, Web Worker p/ textos grandes)──▶ análise (AST + schema intermediário)
                                                              │
config (personalizações, separadas do JSON) ──────────────────┤
                                                              ▼
                               computed: resolveSchema → generateJava / generateTypeScript
                                                              ▼
                                   arquivos gerados + diagnósticos + destaque sincronizado
```

- O **JSON original nunca é alterado** pelas personalizações; elas ficam em `ProjectConfig`,
  indexadas por caminhos estáveis (`#/telefones/*/ddd`).
- O **modelo intermediário** tem duas etapas, ambas independentes da linguagem de saída:
  `SchemaAnalysis` (o que foi inferido do JSON) e `ResolvedSchema` (o que será gerado, com as
  configurações aplicadas). Cada `ResolvedProperty` guarda seu tipo final (incluindo a definição
  de tipo do usuário), a categoria do tipo Java e suas próprias regras de validação já
  verificadas (`ResolvedValidation[]`). Os geradores apenas escrevem essas regras.
- Os geradores são **funções puras e determinísticas**, sem dependência de Angular, e registram
  a linha de declaração de cada propriedade para o destaque entre painéis.
- O estado da aplicação usa **Signals** e `computed()`; não há NgRx nem subscriptions manuais.
- O projeto (JSON + configurações), o tema e o tamanho dos painéis são salvos no
  `localStorage` do navegador.

## Testes

- `npm test`: parser e mensagens de erro, inferência (aninhados, arrays de objetos, vazios,
  heterogêneos, nulos, opcionais), conversão de tipos, geração Java Class/Record/Lombok,
  TypeScript, ZIP, exportação, store e componentes. Inclui, para Jakarta Validation: todas as
  anotações, imports somente quando usados, `@Valid` em cascata (objetos e coleções) e junto com
  `@NotNull`, ausência de regras não configuradas, regras incompatíveis ou inválidas descartadas,
  as mesmas regras em Class/Record/Lombok e a definição de tipo de campos não inferidos. Para
  nomes: nome configurado do modelo principal preservado, classes aninhadas sem prefixos
  redundantes e sufixo de classe sem repetição.
- `npm run test:compile`: gera código para todos os exemplos e para um JSON de estresse em todas
  as variações de formato/opções e compila com `javac --release 21` (com stubs das anotações
  Jakarta, Jackson e Lombok) e com o compilador TypeScript em modo `strict`. Se o `javac` não
  estiver disponível, os casos Java são ignorados.

## Fora do escopo desta versão

Autenticação, backend, banco de dados, integrações externas, geração de controllers,
repositories, entidades JPA ou projetos Spring Boot, IA e colaboração em tempo real.
