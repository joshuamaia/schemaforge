import { GenerationResult, generateCode } from '../generators/code-generator';
import {
  JavaOptions,
  OutputFormat,
  ProjectConfig,
  PropertyConfig,
  createDefaultConfig,
} from '../models/config.model';
import { SchemaAnalysis } from '../models/schema.model';
import { analyzeJson } from '../parsers/json-analysis';

export const CLIENTE_JSON = `{
  "id": 100,
  "nome": "Maria",
  "email": "maria@email.com",
  "ativo": true,
  "endereco": {
    "logradouro": "Rua A",
    "numero": 150,
    "cidade": "João Pessoa"
  },
  "telefones": [
    {
      "ddd": "83",
      "numero": "999999999"
    }
  ]
}`;

export function analyze(json: string): SchemaAnalysis {
  const result = analyzeJson(json);
  if (!result.schema) {
    throw new Error(`Invalid test JSON: ${result.syntaxError?.message}`);
  }
  return result.schema;
}

export interface ConfigPatch {
  readonly rootName?: string;
  readonly format?: OutputFormat;
  readonly java?: Partial<JavaOptions>;
  readonly properties?: Record<string, PropertyConfig>;
  readonly models?: Record<string, { name?: string }>;
}

export function buildConfig(patch: ConfigPatch = {}): ProjectConfig {
  const base = createDefaultConfig();
  return {
    ...base,
    rootName: patch.rootName ?? 'Cliente',
    format: patch.format ?? base.format,
    java: { ...base.java, ...patch.java },
    properties: patch.properties ?? {},
    models: patch.models ?? {},
  };
}

export function generate(json: string, patch: ConfigPatch = {}): GenerationResult {
  return generateCode(analyze(json), buildConfig(patch));
}

export function fileContent(result: GenerationResult, name: string): string {
  const file = result.files.find((candidate) => candidate.name === name);
  if (!file) {
    throw new Error(
      `File ${name} not generated. Got: ${result.files.map((f) => f.name).join(', ')}`,
    );
  }
  return file.content;
}
