import { OutputFormat, PropertyConfig } from '../../models/config.model';
import { analyze, buildConfig, fileContent, generate } from '../../testing/test-helpers';
import { resolveSchema } from '../schema-resolver';

const JSON = `{
  "nome": "Maria",
  "email": "maria@email.com",
  "codigo": "A1",
  "idade": 30,
  "populacao": 3000000000,
  "saldo": 10.5,
  "tags": ["a"],
  "endereco": { "cidade": "João Pessoa" },
  "telefones": [{ "numero": "999" }]
}`;

const ALL_RULES: Record<string, PropertyConfig> = {
  '#/nome': { validations: { notNull: true, notBlank: true, size: { min: 2, max: 100 } } },
  '#/email': { validations: { notEmpty: true, email: true } },
  '#/codigo': { validations: { pattern: '^[A-Z]\\d+$' } },
  '#/idade': { validations: { min: '18', max: '120' } },
  '#/populacao': { validations: { min: '0', max: '9000000000' } },
  '#/saldo': { validations: { min: '0.01', max: '9999.99' } },
  '#/tags': { validations: { notEmpty: true, size: { max: 5 } } },
  '#/endereco': { validations: { notNull: true } },
  '#/telefones': { validations: { notNull: true, size: { min: 1 } } },
};

const CONSTRAINT_IMPORTS = [
  'NotNull',
  'NotBlank',
  'NotEmpty',
  'Size',
  'Email',
  'Pattern',
  'Min',
  'Max',
  'DecimalMin',
  'DecimalMax',
];

function cliente(format: OutputFormat = 'java-class', properties = ALL_RULES, java = {}): string {
  return fileContent(generate(JSON, { format, properties, java }), 'Cliente.java');
}

describe('Jakarta Validation generation', () => {
  it('stores each property rules in the intermediate model', () => {
    const schema = resolveSchema(analyze(JSON), buildConfig({ properties: ALL_RULES }), 'java');
    const rules = new Map(
      schema.models[0].properties.map((property) => [property.jsonName, property.validations]),
    );
    expect(rules.get('nome')).toEqual([
      { kind: 'notNull' },
      { kind: 'notBlank' },
      { kind: 'size', min: 2, max: 100 },
    ]);
    expect(rules.get('saldo')).toEqual([
      { kind: 'min', value: '0.01', decimal: true },
      { kind: 'max', value: '9999.99', decimal: true },
    ]);
    expect(rules.get('idade')).toEqual([
      { kind: 'min', value: '18', decimal: false },
      { kind: 'max', value: '120', decimal: false },
    ]);
    expect(rules.get('codigo')).toEqual([{ kind: 'pattern', regexp: '^[A-Z]\\d+$' }]);
  });

  it('generates every supported annotation on the right field', () => {
    const content = cliente();
    expect(content).toContain(
      '    @NotNull\n    @NotBlank\n    @Size(min = 2, max = 100)\n    private String nome;',
    );
    expect(content).toContain('    @NotEmpty\n    @Email\n    private String email;');
    expect(content).toContain('    @Pattern(regexp = "^[A-Z]\\\\d+$")\n    private String codigo;');
    expect(content).toContain('    @Min(18)\n    @Max(120)\n    private Long idade;');
    expect(content).toContain('    @Min(0)\n    @Max(9000000000L)\n    private Long populacao;');
    expect(content).toContain(
      '    @DecimalMin("0.01")\n    @DecimalMax("9999.99")\n    private BigDecimal saldo;',
    );
    expect(content).toContain('    @NotEmpty\n    @Size(max = 5)\n    private List<String> tags;');
    for (const name of CONSTRAINT_IMPORTS) {
      expect(content).toContain(`import jakarta.validation.constraints.${name};`);
    }
  });

  it('generates only the imports that are used', () => {
    const content = cliente('java-class', { '#/email': { validations: { email: true } } });
    const imports = content.split('\n').filter((line) => line.startsWith('import jakarta'));
    expect(imports).toEqual([
      'import jakarta.validation.Valid;',
      'import jakarta.validation.constraints.Email;',
    ]);
  });

  it('adds @Valid to nested objects and collections of objects', () => {
    const content = cliente('java-class', {});
    expect(content).toContain('    @Valid\n    private Endereco endereco;');
    expect(content).toContain('    @Valid\n    private List<Telefone> telefones;');
    expect(content).not.toMatch(/@Valid\n {4}private (String|Long|BigDecimal|List<String>)/);
  });

  it('keeps @Valid (cascade) and @NotNull (presence) as independent annotations', () => {
    const content = cliente();
    expect(content).toContain('    @NotNull\n    @Valid\n    private Endereco endereco;');
    expect(content).toContain(
      '    @NotNull\n    @Size(min = 1)\n    @Valid\n    private List<Telefone> telefones;',
    );
    const withoutCascade = cliente('java-class', ALL_RULES, { cascadeValidation: false });
    expect(withoutCascade).not.toContain('@Valid');
    expect(withoutCascade).not.toContain('import jakarta.validation.Valid;');
    expect(withoutCascade).toContain('    @NotNull\n    private Endereco endereco;');
  });

  it('never adds rules that were not configured', () => {
    const content = cliente('java-class', {});
    expect(content).not.toMatch(/@(NotNull|NotBlank|NotEmpty|Size|Email|Pattern|Min|Max|Decimal)/);
    expect(content).not.toContain('jakarta.validation.constraints');
  });

  it('omits all validation annotations when Jakarta Validation is disabled', () => {
    const content = cliente('java-class', ALL_RULES, { jakartaValidation: false });
    expect(content).not.toContain('jakarta');
    expect(content).not.toMatch(/@(NotNull|Valid|Size|Min)/);
  });

  it('drops rules that are incompatible with the Java type', () => {
    const content = cliente('java-class', {
      '#/idade': { validations: { notBlank: true, email: true, notEmpty: true, pattern: 'x' } },
      '#/nome': { validations: { min: '1', max: '2' } },
      '#/tags': { validations: { email: true, notBlank: true } },
      '#/endereco': { validations: { size: { max: 1 }, notBlank: true } },
    });
    expect(content).not.toContain('jakarta.validation.constraints');
  });

  it('follows the category of a custom Java type', () => {
    const content = cliente('java-class', {
      '#/idade': { javaType: 'String', validations: { notBlank: true, min: '1' } },
    });
    expect(content).toContain('    @NotBlank\n    private String idade;');
    expect(content).not.toContain('@Min');
  });

  it('drops rules with invalid parameters so the code still compiles', () => {
    const content = cliente('java-class', {
      '#/idade': { validations: { min: 'abc', max: '1.5' } },
      '#/saldo': { validations: { min: '1,5' } },
      '#/nome': { validations: { size: { min: 10, max: 2 }, pattern: '([a-z' } },
      '#/tags': { validations: { size: { min: -1 } } },
    });
    expect(content).not.toMatch(/@(Min|Max|DecimalMin|Size|Pattern)/);
  });

  it.each<OutputFormat>(['java-class', 'java-record', 'java-lombok'])(
    'keeps the same rules in %s',
    (format) => {
      const content = cliente(format);
      const annotations = content.match(
        /@(NotNull|NotBlank|NotEmpty|Size|Email|Pattern|Min|Max|DecimalMin|DecimalMax|Valid)\b/g,
      );
      expect(annotations).toEqual(
        cliente('java-class').match(
          /@(NotNull|NotBlank|NotEmpty|Size|Email|Pattern|Min|Max|DecimalMin|DecimalMax|Valid)\b/g,
        ),
      );
    },
  );

  it('places the annotations on record components', () => {
    const content = cliente('java-record');
    expect(content).toContain('        @NotNull @NotBlank @Size(min = 2, max = 100) String nome,');
    expect(content).toContain('        @NotNull @Valid Endereco endereco,');
    expect(content).toContain('        @NotNull @Size(min = 1) @Valid List<Telefone> telefones) {');
  });
});

describe('type definition for values that cannot be inferred', () => {
  const json = '{"apelido": null, "preferencias": [], "misto": [1, "a"]}';

  it('generates Object/unknown and reports the type as undefined without a definition', () => {
    const result = generate(json);
    const content = fileContent(result, 'Cliente.java');
    expect(content).toContain('private Object apelido;');
    expect(content).toContain('private List<Object> preferencias;');
    expect(result.schema.models[0].properties.every((p) => !p.typeDefined)).toBe(true);
  });

  it('applies the defined type to Java, TypeScript and the validations', () => {
    const properties: Record<string, PropertyConfig> = {
      '#/apelido': { typeOverride: 'string', validations: { notBlank: true } },
      '#/preferencias': { typeOverride: 'integer', validations: { notEmpty: true } },
      '#/misto': { typeOverride: 'decimal' },
    };
    const java = generate(json, { properties });
    const content = fileContent(java, 'Cliente.java');
    expect(content).toContain('    @NotBlank\n    private String apelido;');
    expect(content).toContain('    @NotEmpty\n    private List<Long> preferencias;');
    expect(content).toContain('    private List<BigDecimal> misto;');
    expect(java.schema.models[0].properties.every((p) => p.typeDefined)).toBe(true);

    const ts = fileContent(
      generate(json, { format: 'typescript', properties }),
      'cliente.model.ts',
    );
    expect(ts).toContain('  apelido: string | null;');
    expect(ts).toContain('  preferencias: number[];');
    expect(ts).toContain('  misto: number[];');
  });
});
