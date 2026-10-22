import { Diagnostic } from '../../../core/models/diagnostic';
import { OutputFormat, ProjectConfig } from '../models/config.model';
import { GeneratedFile } from '../models/generated-file.model';
import { ResolvedSchema } from '../models/resolved.model';
import { SchemaAnalysis } from '../models/schema.model';
import { validateConfiguration } from '../validators/model-validator';
import { JavaStyle, generateJava } from './java/java-generator';
import { resolveSchema } from './schema-resolver';
import { generateTypeScript } from './typescript/typescript-generator';

export interface GenerationResult {
  readonly schema: ResolvedSchema;
  readonly files: readonly GeneratedFile[];
  readonly diagnostics: readonly Diagnostic[];
}

const JAVA_STYLES: Readonly<Record<Exclude<OutputFormat, 'typescript'>, JavaStyle>> = {
  'java-class': 'class',
  'java-record': 'record',
  'java-lombok': 'lombok',
};

/** Full pipeline from analyzed schema and configuration to generated files. */
export function generateCode(
  analysis: SchemaAnalysis | null,
  config: ProjectConfig,
): GenerationResult {
  const language = config.format === 'typescript' ? 'typescript' : 'java';
  const schema = resolveSchema(analysis, config, language);
  const files =
    config.format === 'typescript'
      ? generateTypeScript(schema, config.typescript)
      : generateJava(schema, config.java, JAVA_STYLES[config.format]);
  return {
    schema,
    files,
    diagnostics: [...schema.diagnostics, ...validateConfiguration(analysis, config)],
  };
}
