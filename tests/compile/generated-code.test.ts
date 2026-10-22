import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { generateCode } from '../../src/app/features/schema-forge/generators/code-generator';
import {
  OutputFormat,
  ProjectConfig,
  createDefaultConfig,
} from '../../src/app/features/schema-forge/models/config.model';
import { GeneratedFile } from '../../src/app/features/schema-forge/models/generated-file.model';
import { JSON_EXAMPLES } from '../../src/app/features/schema-forge/models/examples';
import { analyzeJson } from '../../src/app/features/schema-forge/parsers/json-analysis';

/** Exercises every generator feature: validations, custom types, odd names, optionals. */
const STRESS_JSON = `{
  "id": 1,
  "big": 99999999999999999999,
  "long": 3000000000,
  "first-name": "Ana",
  "class": "premium",
  "1st": true,
  "hashCode": 5,
  "email": "a@b.c",
  "saldo": 10.5,
  "nascimento": "1990-01-01",
  "tags": ["a", "b"],
  "vazio": [],
  "nulo": null,
  "misto": [1, "x"],
  "matriz": [[1, 2], [3]],
  "cobranca": { "endereco": { "rua": "A" } },
  "entrega": { "endereco": { "rua": "B" } },
  "itens": [
    { "sku": "X", "qtd": 1, "obs": null },
    { "sku": "Y", "qtd": 2, "extra": { "nota": "n" } }
  ],
  "stress": { "apelido": null, "vazio": [] },
  "codigos": [],
  "talvez": null
}`;

function stressConfig(format: OutputFormat): ProjectConfig {
  const base = createDefaultConfig();
  return {
    ...base,
    rootName: 'Stress',
    format,
    java: { ...base.java, classSuffix: 'DTO', allArgsConstructor: true },
    properties: {
      '#/email': {
        validations: { notNull: true, notBlank: true, email: true, size: { max: 120 } },
      },
      '#/saldo': { validations: { min: '0.01', max: '99999.99' } },
      '#/long': { validations: { min: '1', max: '5000000000' } },
      '#/first-name': { validations: { pattern: '^[A-Z]\\\\w+"$' }, description: 'Nome */ com */' },
      '#/nascimento': { javaType: 'LocalDate', tsType: 'string' },
      '#/nulo': { javaType: 'Map<String, Object>', tsType: 'Record<string, unknown>' },
      '#/itens/*/qtd': { validations: { min: '1' } },
      // Nested model with the same name as the root ("stress" inside "Stress").
      '#/stress': { validations: { notNull: true } },
      '#/stress/apelido': { typeOverride: 'string', validations: { notEmpty: true } },
      '#/stress/vazio': {
        typeOverride: 'decimal',
        validations: { notEmpty: true, size: { max: 3 } },
      },
      '#/codigos': { typeOverride: 'integer', validations: { notEmpty: true } },
      '#/tags': { validations: { notEmpty: true, size: { min: 1, max: 10 } } },
      // Invalid parameters must be dropped, never emitted.
      '#/id': { validations: { min: 'abc', max: '1.5' } },
      '#/misto': { validations: { pattern: '([a-z' } },
      '#/talvez': { typeOverride: 'boolean', validations: { notNull: true } },
    },
  };
}

function exampleConfigs(): Array<[string, ProjectConfig]> {
  const formats: OutputFormat[] = ['java-class', 'java-record', 'java-lombok', 'typescript'];
  const configs: Array<[string, ProjectConfig]> = [];
  for (const format of formats) {
    configs.push([`stress:${format}`, stressConfig(format)]);
    for (const optionalHandling of ['primitive-required', 'optional'] as const) {
      const config = stressConfig(format);
      configs.push([
        `stress:${format}:${optionalHandling}`,
        { ...config, java: { ...config.java, optionalHandling, fieldNaming: 'snake_case' } },
      ]);
    }
  }
  return configs;
}

function generateAll(json: string, config: ProjectConfig): readonly GeneratedFile[] {
  const analysis = analyzeJson(json);
  if (!analysis.schema) {
    throw new Error('invalid JSON');
  }
  return generateCode(analysis.schema, config).files;
}

const STUBS: Record<string, string> = {
  'jakarta/validation/Valid.java': 'package jakarta.validation; public @interface Valid {}',
  'com/fasterxml/jackson/annotation/JsonProperty.java':
    'package com.fasterxml.jackson.annotation; public @interface JsonProperty { String value(); }',
};
for (const name of ['NotNull', 'NotBlank', 'NotEmpty', 'Email']) {
  STUBS[`jakarta/validation/constraints/${name}.java`] =
    `package jakarta.validation.constraints; public @interface ${name} {}`;
}
STUBS['jakarta/validation/constraints/Size.java'] =
  'package jakarta.validation.constraints; public @interface Size { int min() default 0; int max() default Integer.MAX_VALUE; }';
for (const name of ['Min', 'Max']) {
  STUBS[`jakarta/validation/constraints/${name}.java`] =
    `package jakarta.validation.constraints; public @interface ${name} { long value(); }`;
}
for (const name of ['DecimalMin', 'DecimalMax']) {
  STUBS[`jakarta/validation/constraints/${name}.java`] =
    `package jakarta.validation.constraints; public @interface ${name} { String value(); }`;
}
STUBS['jakarta/validation/constraints/Pattern.java'] =
  'package jakarta.validation.constraints; public @interface Pattern { String regexp(); }';
for (const name of [
  'Data',
  'Getter',
  'Setter',
  'Builder',
  'NoArgsConstructor',
  'AllArgsConstructor',
]) {
  STUBS[`lombok/${name}.java`] = `package lombok; public @interface ${name} {}`;
}

const javacAvailable = spawnSync('javac', ['-version'], { encoding: 'utf8' }).status === 0;
const workDirs: string[] = [];

afterAll(() => workDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function writeTree(root: string, files: Record<string, string>): string[] {
  return Object.entries(files).map(([path, content]) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    return target;
  });
}

describe.skipIf(!javacAvailable)('generated Java compiles with javac', () => {
  const cases: Array<[string, string, ProjectConfig]> = [];
  for (const [label, config] of exampleConfigs()) {
    if (config.format !== 'typescript') {
      cases.push([label, STRESS_JSON, config]);
    }
  }
  for (const example of JSON_EXAMPLES.filter((item) => item.id !== 'invalid-json')) {
    for (const format of ['java-class', 'java-record', 'java-lombok'] as const) {
      cases.push([
        `${example.id}:${format}`,
        example.json,
        { ...createDefaultConfig(), rootName: example.rootName, format },
      ]);
    }
  }

  it.each(cases)('%s', (_label, json, config) => {
    const dir = mkdtempSync(join(tmpdir(), 'schemaforge-java-'));
    workDirs.push(dir);
    const files = generateAll(json, config);
    expect(files.length).toBeGreaterThan(0);
    const sources = writeTree(join(dir, 'src'), {
      ...STUBS,
      ...Object.fromEntries(files.map((file) => [file.path.replace(/^java\//, ''), file.content])),
    });
    const argsFile = join(dir, 'sources.txt');
    writeFileSync(argsFile, sources.map((source) => `"${source.replace(/\\/g, '/')}"`).join('\n'));
    const result = spawnSync(
      'javac',
      ['--release', '21', '-Xlint:none', '-d', join(dir, 'out'), `@${argsFile}`],
      { encoding: 'utf8' },
    );
    expect(result.stderr + result.stdout).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('generated TypeScript compiles with tsc', () => {
  const cases: Array<[string, string, ProjectConfig]> = [];
  for (const [label, config] of exampleConfigs()) {
    if (config.format === 'typescript') {
      cases.push([label, STRESS_JSON, config]);
      cases.push([
        `${label}:camelCase-readonly`,
        STRESS_JSON,
        { ...config, typescript: { propertyNaming: 'camelCase', readonlyProperties: true } },
      ]);
    }
  }
  for (const example of JSON_EXAMPLES.filter((item) => item.id !== 'invalid-json')) {
    cases.push([
      example.id,
      example.json,
      { ...createDefaultConfig(), rootName: example.rootName, format: 'typescript' },
    ]);
  }

  it.each(cases)('%s', (_label, json, config) => {
    const dir = mkdtempSync(join(tmpdir(), 'schemaforge-ts-'));
    workDirs.push(dir);
    const files = generateAll(json, config);
    expect(files.length).toBeGreaterThan(0);
    const sources = writeTree(
      dir,
      Object.fromEntries(files.map((file) => [file.path, file.content])),
    );
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      skipLibCheck: true,
    };
    const program = ts.createProgram(sources, options);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(diagnostics).toEqual([]);
  });
});
