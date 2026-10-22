import { CLIENTE_JSON, fileContent, generate } from '../../testing/test-helpers';
import { DEFAULT_LOMBOK_OPTIONS } from '../../models/config.model';
import { resolveLombokAnnotations } from './java-generator';

describe('Java generation', () => {
  describe('class', () => {
    it('generates one class per model with package, fields, getters and setters', () => {
      const result = generate(CLIENTE_JSON, { java: { classSuffix: 'DTO' } });
      expect(result.files.map((file) => file.path)).toEqual([
        'java/com/example/model/ClienteDTO.java',
        'java/com/example/model/EnderecoDTO.java',
        'java/com/example/model/TelefoneDTO.java',
      ]);
      const cliente = fileContent(result, 'ClienteDTO.java');
      expect(cliente).toContain('package com.example.model;');
      expect(cliente).toContain('import java.util.List;');
      expect(cliente).toContain('public class ClienteDTO {');
      expect(cliente).toContain('    private Long id;');
      expect(cliente).toContain('    private EnderecoDTO endereco;');
      expect(cliente).toContain('    private List<TelefoneDTO> telefones;');
      expect(cliente).toContain('    public ClienteDTO() {\n    }');
      expect(cliente).toContain('    public Long getId() {\n        return id;\n    }');
      expect(cliente).toContain(
        '    public void setTelefones(List<TelefoneDTO> telefones) {\n        this.telefones = telefones;\n    }',
      );
    });

    it('cascades validation to nested models with @Valid', () => {
      const cliente = fileContent(generate(CLIENTE_JSON), 'Cliente.java');
      expect(cliente).toContain('import jakarta.validation.Valid;');
      expect(cliente).toContain('    @Valid\n    private Endereco endereco;');
    });

    it('does not import unused types', () => {
      const endereco = fileContent(generate(CLIENTE_JSON), 'Endereco.java');
      expect(endereco).not.toContain('import');
    });

    it('generates an all-args constructor when requested', () => {
      const result = generate('{"a": 1, "b": "x"}', { java: { allArgsConstructor: true } });
      expect(fileContent(result, 'Cliente.java')).toContain(
        '    public Cliente(Long a, String b) {\n        this.a = a;\n        this.b = b;\n    }',
      );
    });

    it('maps types according to the numeric preferences', () => {
      const json = '{"i": 1, "l": 3000000000, "big": 99999999999999999999, "d": 1.5, "b": true}';
      const integer = fileContent(
        generate(json, { java: { integerType: 'Integer', decimalType: 'Double' } }),
        'Cliente.java',
      );
      expect(integer).toContain('private Integer i;');
      expect(integer).toContain('private Long l;');
      expect(integer).toContain('private BigInteger big;');
      expect(integer).toContain('private Double d;');
      expect(integer).toContain('private Boolean b;');
      expect(integer).toContain('import java.math.BigInteger;');
      const decimal = fileContent(generate(json), 'Cliente.java');
      expect(decimal).toContain('private BigDecimal d;');
      expect(decimal).toContain('import java.math.BigDecimal;');
    });

    it('uses primitives for required non-null fields when configured', () => {
      const result = generate('{"itens": [{"q": 1, "ok": true}, {"q": 2}]}', {
        java: { optionalHandling: 'primitive-required' },
      });
      const item = fileContent(result, 'Iten.java'.replace('Iten', 'Item'));
      expect(item).toContain('private long q;');
      expect(item).toContain('private Boolean ok;');
      expect(item).toContain('public long getQ()');
    });

    it('returns Optional from getters of optional fields when configured', () => {
      const result = generate('{"itens": [{"q": 1, "nota": "x"}, {"q": 2}]}', {
        java: { optionalHandling: 'optional' },
      });
      const item = fileContent(result, 'Item.java');
      expect(item).toContain('import java.util.Optional;');
      expect(item).toContain(
        '    public Optional<String> getNota() {\n        return Optional.ofNullable(nota);\n    }',
      );
      expect(item).toContain('    public Long getQ() {');
    });

    it('keeps date strings as String by default and converts them only on request', () => {
      const json = '{"nascimento": "1990-05-17", "criadoEm": "2026-10-22T10:00:00Z"}';
      expect(fileContent(generate(json), 'Cliente.java')).toContain('private String nascimento;');
      const converted = fileContent(
        generate(json, {
          properties: {
            '#/nascimento': { javaType: 'LocalDate' },
            '#/criadoEm': { javaType: 'OffsetDateTime' },
          },
        }),
        'Cliente.java',
      );
      expect(converted).toContain('import java.time.LocalDate;');
      expect(converted).toContain('import java.time.OffsetDateTime;');
      expect(converted).toContain('private LocalDate nascimento;');
      expect(converted).toContain('private OffsetDateTime criadoEm;');
    });

    it('adjusts invalid and reserved names and maps them with @JsonProperty', () => {
      const result = generate('{"first-name": "a", "class": "b", "1st": 1, "snake_case": 2}');
      const content = fileContent(result, 'Cliente.java');
      expect(content).toContain('    @JsonProperty("first-name")\n    private String firstName;');
      expect(content).toContain('    @JsonProperty("class")\n    private String class_;');
      expect(content).toContain('    @JsonProperty("1st")\n    private Long _1st;');
      expect(content).toContain('    @JsonProperty("snake_case")\n    private Long snakeCase;');
      expect(content).toContain('import com.fasterxml.jackson.annotation.JsonProperty;');
      expect(content).toContain('public String getClass_()');
    });

    it('resolves field name conflicts', () => {
      const content = fileContent(generate('{"user_name": "a", "userName": "b"}'), 'Cliente.java');
      expect(content).toContain('private String userName;');
      expect(content).toContain('private String userName2;');
    });

    it('applies the snake_case field naming convention', () => {
      const content = fileContent(
        generate('{"nomeCompleto": "a"}', { java: { fieldNaming: 'snake_case' } }),
        'Cliente.java',
      );
      expect(content).toContain('@JsonProperty("nomeCompleto")\n    private String nome_completo;');
    });

    it('omits the package when it is empty', () => {
      const result = generate('{"a": 1}', { java: { basePackage: '' } });
      expect(result.files[0].path).toBe('java/Cliente.java');
      expect(result.files[0].content.startsWith('public class Cliente')).toBe(true);
    });

    it('excludes properties and the models only they reference', () => {
      const result = generate(CLIENTE_JSON, { properties: { '#/endereco': { included: false } } });
      expect(result.files.map((file) => file.name)).toEqual(['Cliente.java', 'Telefone.java']);
      expect(fileContent(result, 'Cliente.java')).not.toContain('endereco');
    });

    it('renames properties and models from the configuration', () => {
      const result = generate(CLIENTE_JSON, {
        properties: { '#/nome': { generatedName: 'nomeCompleto' } },
        models: { '#/endereco': { name: 'Localizacao' } },
      });
      const cliente = fileContent(result, 'Cliente.java');
      expect(cliente).toContain('@JsonProperty("nome")\n    private String nomeCompleto;');
      expect(cliente).toContain('private Localizacao endereco;');
      expect(result.files.map((file) => file.name)).toContain('Localizacao.java');
    });

    it('records declaration lines for each property', () => {
      const file = generate(CLIENTE_JSON).files[0];
      const lines = file.content.split('\n');
      const span = file.declarations['#/nome'];
      expect(lines[span.endLine - 1]).toContain('private String nome;');
    });
  });

  describe('Jakarta Validation', () => {
    const json =
      '{"nome": "a", "email": "x@y.z", "idade": 30, "saldo": 10.5, "tags": ["a"], "codigo": "A1"}';
    const properties = {
      '#/nome': { validations: { notNull: true, notBlank: true, size: { min: 2, max: 100 } } },
      '#/email': { validations: { email: true } },
      '#/idade': { validations: { min: '18', max: '3000000000' } },
      '#/saldo': { validations: { min: '0.01', max: '9999.99' } },
      '#/tags': { validations: { size: { max: 5 } } },
      '#/codigo': { validations: { pattern: '^[A-Z]\\d+$' } },
    };

    it('generates the configured annotations with their imports', () => {
      const content = fileContent(generate(json, { properties }), 'Cliente.java');
      expect(content).toContain(
        '    @NotNull\n    @NotBlank\n    @Size(min = 2, max = 100)\n    private String nome;',
      );
      expect(content).toContain('    @Email\n    private String email;');
      expect(content).toContain('    @Min(18)\n    @Max(3000000000L)\n    private Long idade;');
      expect(content).toContain(
        '    @DecimalMin("0.01")\n    @DecimalMax("9999.99")\n    private BigDecimal saldo;',
      );
      expect(content).toContain('    @Size(max = 5)\n    private List<String> tags;');
      expect(content).toContain(
        '    @Pattern(regexp = "^[A-Z]\\\\d+$")\n    private String codigo;',
      );
      for (const annotation of [
        'NotNull',
        'NotBlank',
        'Size',
        'Email',
        'Min',
        'Max',
        'DecimalMin',
        'DecimalMax',
        'Pattern',
      ]) {
        expect(content).toContain(`import jakarta.validation.constraints.${annotation};`);
      }
    });

    it('ignores incompatible validations', () => {
      const content = fileContent(
        generate('{"idade": 30}', {
          properties: { '#/idade': { validations: { notBlank: true, email: true } } },
        }),
        'Cliente.java',
      );
      expect(content).not.toContain('@NotBlank');
      expect(content).not.toContain('@Email');
      expect(content).not.toContain('jakarta');
    });

    it('omits validation annotations when Jakarta Validation is disabled', () => {
      const content = fileContent(
        generate(json, { properties, java: { jakartaValidation: false } }),
        'Cliente.java',
      );
      expect(content).not.toContain('jakarta');
      expect(content).not.toContain('@NotNull');
    });

    it('never presumes validations from names', () => {
      const content = fileContent(generate(json), 'Cliente.java');
      expect(content).not.toContain('@Email');
      expect(content).not.toContain('@NotNull');
    });
  });

  describe('record', () => {
    it('generates records with components, annotations and nested models', () => {
      const result = generate(CLIENTE_JSON, {
        format: 'java-record',
        properties: { '#/email': { validations: { email: true, notBlank: true } } },
      });
      const cliente = fileContent(result, 'Cliente.java');
      expect(cliente).toContain(
        [
          'public record Cliente(',
          '        Long id,',
          '        String nome,',
          '        @NotBlank @Email String email,',
          '        Boolean ativo,',
          '        @Valid Endereco endereco,',
          '        @Valid List<Telefone> telefones) {',
          '}',
        ].join('\n'),
      );
      expect(fileContent(result, 'Telefone.java')).toContain('public record Telefone(');
      expect(cliente).not.toContain('lombok');
      expect(cliente).not.toContain('get');
    });

    it('renames components that clash with Object methods', () => {
      const content = fileContent(
        generate('{"hashCode": 1}', { format: 'java-record' }),
        'Cliente.java',
      );
      expect(content).toContain('@JsonProperty("hashCode") Long hashCode_) {');
    });

    it('generates records without components', () => {
      const content = fileContent(generate('{}', { format: 'java-record' }), 'Cliente.java');
      expect(content).toBe('package com.example.model;\n\npublic record Cliente() {\n}\n');
    });

    it('documents components with @param', () => {
      const content = fileContent(
        generate('{"a": 1}', {
          format: 'java-record',
          properties: { '#/a': { description: 'Identificador' } },
        }),
        'Cliente.java',
      );
      expect(content).toContain('/**\n * @param a Identificador\n */\npublic record Cliente(');
    });
  });

  describe('Lombok', () => {
    it('generates Lombok annotations instead of accessors', () => {
      const result = generate(CLIENTE_JSON, { format: 'java-lombok' });
      const cliente = fileContent(result, 'Cliente.java');
      expect(cliente).toContain(
        '@Data\n@Builder\n@NoArgsConstructor\n@AllArgsConstructor\npublic class Cliente {',
      );
      expect(cliente).toContain('import lombok.Data;');
      expect(cliente).toContain('import lombok.Builder;');
      expect(cliente).not.toContain('public Long getId()');
      expect(cliente).not.toContain('public Cliente()');
    });

    it('avoids redundant annotations', () => {
      expect(
        resolveLombokAnnotations({ ...DEFAULT_LOMBOK_OPTIONS, getter: true, setter: true }, 2),
      ).toEqual(['Data', 'Builder', 'NoArgsConstructor', 'AllArgsConstructor']);
    });

    it('adds @AllArgsConstructor required by @Builder with @NoArgsConstructor', () => {
      expect(
        resolveLombokAnnotations(
          {
            getter: true,
            setter: false,
            data: false,
            noArgsConstructor: true,
            allArgsConstructor: false,
            builder: true,
          },
          1,
        ),
      ).toEqual(['Getter', 'Builder', 'NoArgsConstructor', 'AllArgsConstructor']);
    });

    it('avoids duplicate constructors on classes without fields', () => {
      expect(resolveLombokAnnotations(DEFAULT_LOMBOK_OPTIONS, 0)).toEqual([
        'Data',
        'Builder',
        'NoArgsConstructor',
      ]);
    });

    it('sorts imports with JDK imports in a separate group', () => {
      const content = fileContent(
        generate(CLIENTE_JSON, { format: 'java-lombok' }),
        'Cliente.java',
      );
      expect(content).toContain(
        [
          'import jakarta.validation.Valid;',
          'import lombok.AllArgsConstructor;',
          'import lombok.Builder;',
          'import lombok.Data;',
          'import lombok.NoArgsConstructor;',
          '',
          'import java.util.List;',
        ].join('\n'),
      );
    });
  });

  it('is deterministic', () => {
    const first = generate(CLIENTE_JSON, { format: 'java-lombok' });
    const second = generate(CLIENTE_JSON, { format: 'java-lombok' });
    expect(first.files).toEqual(second.files);
  });
});
