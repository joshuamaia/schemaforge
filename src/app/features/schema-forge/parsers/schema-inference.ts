import { Diagnostic } from '../../../core/models/diagnostic';
import { SourceRange } from '../../../core/models/source-range';
import { JAVA_RESERVED_WORDS, isSimpleIdentifier } from '../../../core/utils/naming';
import {
  InferredType,
  IntegerRange,
  SchemaAnalysis,
  SchemaObjectModel,
  SchemaProperty,
} from '../models/schema.model';
import { JsonNode, JsonObjectNode } from './json-ast';

export const ROOT_PATH = '#';
const ARRAY_SEGMENT = '*';
const MAX_LOCATIONS = 200;
const INT_MAX = 2n ** 31n - 1n;
const INT_MIN = -(2n ** 31n);
const LONG_MAX = 2n ** 63n - 1n;
const LONG_MIN = -(2n ** 63n);

/** Mutable accumulator of every value observed at one JSON path. */
interface Shape {
  string: boolean;
  integer: IntegerRange | null;
  decimal: boolean;
  boolean: boolean;
  null: boolean;
  object: string | null;
  array: Shape | null;
}

interface PropertyAccumulator {
  readonly key: string;
  readonly shape: Shape;
  presentCount: number;
  readonly locations: SourceRange[];
}

interface ModelAccumulator {
  readonly id: string;
  readonly parentId: string | null;
  readonly sourceKey: string | null;
  readonly fromArray: boolean;
  sampleCount: number;
  readonly properties: Map<string, PropertyAccumulator>;
}

const emptyShape = (): Shape => ({
  string: false,
  integer: null,
  decimal: false,
  boolean: false,
  null: false,
  object: null,
  array: null,
});

/** Escapes a key so it can be used as a path segment (JSON Pointer style). */
export function escapePathSegment(key: string): string {
  const escaped = key.replace(/~/g, '~0').replace(/\//g, '~1');
  return escaped === ARRAY_SEGMENT ? '~2' : escaped;
}

export function childPath(parent: string, key: string): string {
  return `${parent}/${escapePathSegment(key)}`;
}

function integerRange(raw: string): IntegerRange {
  if (raw.length <= 9) {
    return 'int';
  }
  const value = BigInt(raw);
  if (value >= INT_MIN && value <= INT_MAX) {
    return 'int';
  }
  return value >= LONG_MIN && value <= LONG_MAX ? 'long' : 'big';
}

const RANGE_ORDER: Readonly<Record<IntegerRange, number>> = { int: 0, long: 1, big: 2 };

function widerRange(current: IntegerRange | null, next: IntegerRange): IntegerRange {
  return current === null || RANGE_ORDER[next] > RANGE_ORDER[current] ? next : current;
}

class SchemaInferrer {
  private readonly models = new Map<string, ModelAccumulator>();
  private readonly diagnostics: Diagnostic[] = [];

  analyze(root: JsonNode): SchemaAnalysis {
    let rootModelId: string | null = null;
    if (root.type === 'object') {
      this.visitObject(root, ROOT_PATH, null, null, false);
      rootModelId = ROOT_PATH;
    } else if (root.type === 'array') {
      const shape = emptyShape();
      const itemPath = `${ROOT_PATH}/${ARRAY_SEGMENT}`;
      for (const item of root.items) {
        this.visitValue(item, shape, itemPath, null, null, true);
      }
      if (shape.object !== null) {
        rootModelId = shape.object;
        this.diagnostics.push({
          severity: 'info',
          code: 'root-array',
          message:
            'A raiz do documento é um array: o modelo principal representa cada item do array.',
          range: { start: root.range.start, end: root.range.start + 1 },
        });
        if (shape.string || shape.integer || shape.decimal || shape.boolean || shape.array) {
          this.diagnostics.push({
            severity: 'warning',
            code: 'heterogeneous-array',
            message:
              'O array raiz mistura objetos com outros tipos; apenas os objetos foram considerados.',
            range: { start: root.range.start, end: root.range.start + 1 },
          });
        }
      } else {
        this.diagnostics.push({
          severity: 'error',
          code: 'unsupported-root',
          message:
            'O array raiz não contém objetos, portanto não há modelos para gerar. Utilize um objeto ou um array de objetos.',
          range: { start: root.range.start, end: root.range.end },
        });
      }
    } else {
      this.diagnostics.push({
        severity: 'error',
        code: 'unsupported-root',
        message: `A raiz do documento é um valor ${root.type === 'string' ? 'textual' : 'primitivo'}; utilize um objeto ou um array de objetos para gerar modelos.`,
        range: { start: root.range.start, end: root.range.end },
      });
    }

    const models = [...this.models.values()].map((model) => this.finalizeModel(model));
    return { rootModelId, models, diagnostics: this.diagnostics };
  }

  private visitObject(
    node: JsonObjectNode,
    path: string,
    parentId: string | null,
    sourceKey: string | null,
    fromArray: boolean,
  ): void {
    let model = this.models.get(path);
    if (!model) {
      model = { id: path, parentId, sourceKey, fromArray, sampleCount: 0, properties: new Map() };
      this.models.set(path, model);
    }
    model.sampleCount++;
    const seen = new Set<string>();
    for (const property of node.properties) {
      if (seen.has(property.key)) {
        this.diagnostics.push({
          severity: 'warning',
          code: 'duplicate-key',
          message: `A propriedade "${property.key}" está duplicada no mesmo objeto; apenas a última ocorrência é considerada por parsers JSON.`,
          propertyId: childPath(path, property.key),
          range: property.keyRange,
        });
      }
      let accumulator = model.properties.get(property.key);
      if (!accumulator) {
        accumulator = { key: property.key, shape: emptyShape(), presentCount: 0, locations: [] };
        model.properties.set(property.key, accumulator);
      }
      if (!seen.has(property.key)) {
        accumulator.presentCount++;
        seen.add(property.key);
      }
      if (accumulator.locations.length < MAX_LOCATIONS) {
        accumulator.locations.push(property.keyRange);
      }
      this.visitValue(
        property.value,
        accumulator.shape,
        childPath(path, property.key),
        path,
        property.key,
        false,
      );
    }
  }

  private visitValue(
    node: JsonNode,
    shape: Shape,
    path: string,
    parentId: string | null,
    sourceKey: string | null,
    fromArray: boolean,
  ): void {
    switch (node.type) {
      case 'string':
        shape.string = true;
        return;
      case 'number':
        if (node.isInteger) {
          shape.integer = widerRange(shape.integer, integerRange(node.raw));
        } else {
          shape.decimal = true;
        }
        return;
      case 'boolean':
        shape.boolean = true;
        return;
      case 'null':
        shape.null = true;
        return;
      case 'object':
        shape.object = path;
        this.visitObject(node, path, parentId, sourceKey, fromArray);
        return;
      case 'array': {
        shape.array ??= emptyShape();
        const itemPath = `${path}/${ARRAY_SEGMENT}`;
        for (const item of node.items) {
          this.visitValue(item, shape.array, itemPath, parentId, sourceKey, true);
        }
        return;
      }
    }
  }

  private finalizeModel(model: ModelAccumulator): SchemaObjectModel {
    const properties: SchemaProperty[] = [];
    for (const accumulator of model.properties.values()) {
      const id = childPath(model.id, accumulator.key);
      const { type, nullable } = this.finalizeShape(accumulator.shape);
      const property: SchemaProperty = {
        id,
        modelId: model.id,
        key: accumulator.key,
        type,
        nullable,
        optional: accumulator.presentCount < model.sampleCount,
        presentCount: accumulator.presentCount,
        sampleCount: model.sampleCount,
        locations: accumulator.locations,
      };
      this.checkProperty(property, accumulator.shape);
      properties.push(property);
    }
    return {
      id: model.id,
      parentId: model.parentId,
      sourceKey: model.sourceKey,
      fromArray: model.fromArray,
      sampleCount: model.sampleCount,
      properties,
    };
  }

  private finalizeShape(shape: Shape): { type: InferredType; nullable: boolean } {
    const variants: InferredType[] = [];
    if (shape.string) {
      variants.push({ kind: 'string' });
    }
    if (shape.decimal) {
      variants.push({ kind: 'decimal' });
    } else if (shape.integer !== null) {
      variants.push({ kind: 'integer', range: shape.integer });
    }
    if (shape.boolean) {
      variants.push({ kind: 'boolean' });
    }
    if (shape.object !== null) {
      variants.push({ kind: 'object', modelId: shape.object });
    }
    if (shape.array !== null) {
      const element = this.finalizeShape(shape.array);
      const isEmpty = isEmptyShape(shape.array);
      variants.push({
        kind: 'array',
        element: isEmpty ? { kind: 'unknown', reason: 'empty-array' } : element.type,
        elementNullable: !isEmpty && element.nullable,
      });
    }
    if (variants.length === 0) {
      return { type: { kind: 'unknown', reason: 'null' }, nullable: true };
    }
    return {
      type: variants.length === 1 ? variants[0] : { kind: 'union', variants },
      nullable: shape.null,
    };
  }

  private checkProperty(property: SchemaProperty, shape: Shape): void {
    const range = property.locations[0];
    const label = `"${property.key}"`;
    const warn = (code: Diagnostic['code'], message: string): void => {
      this.diagnostics.push({ severity: 'warning', code, message, propertyId: property.id, range });
    };

    if (property.type.kind === 'unknown' && property.type.reason === 'null') {
      warn(
        'null-only',
        `A propriedade ${label} possui apenas valores nulos; o tipo não pode ser determinado com segurança. Defina um tipo personalizado.`,
      );
    }
    if (property.type.kind === 'union') {
      warn(
        'mixed-types',
        `A propriedade ${label} possui tipos mistos (${describeVariants(property.type.variants)}). Será gerado um tipo genérico; considere definir um tipo personalizado.`,
      );
    }
    let arrayType: InferredType = property.type;
    let level = shape.array;
    while (arrayType.kind === 'array' && level !== null) {
      if (arrayType.element.kind === 'unknown' && arrayType.element.reason === 'empty-array') {
        warn(
          'empty-array',
          `A propriedade ${label} contém apenas arrays vazios; o tipo dos elementos não pode ser inferido. Defina um tipo personalizado.`,
        );
      } else if (arrayType.element.kind === 'unknown') {
        warn(
          'null-only',
          `Os itens do array ${label} são apenas nulos; o tipo dos elementos não pode ser inferido.`,
        );
      } else if (arrayType.element.kind === 'union') {
        warn(
          'heterogeneous-array',
          `O array ${label} é heterogêneo (${describeVariants(arrayType.element.variants)}). Considere definir um tipo personalizado.`,
        );
      }
      arrayType = arrayType.element;
      level = level.array;
    }
    const problem = describeNameProblem(property.key);
    if (problem) {
      this.diagnostics.push({
        severity: 'warning',
        code: 'problematic-name',
        message: `O nome ${label} ${problem}; o identificador será ajustado no código gerado e o nome original preservado no mapeamento.`,
        propertyId: property.id,
        range,
      });
    }
  }
}

function isEmptyShape(shape: Shape): boolean {
  return (
    !shape.string &&
    shape.integer === null &&
    !shape.decimal &&
    !shape.boolean &&
    !shape.null &&
    shape.object === null &&
    shape.array === null
  );
}

export function describeType(type: InferredType): string {
  switch (type.kind) {
    case 'string':
      return 'string';
    case 'integer':
      return 'integer';
    case 'decimal':
      return 'decimal';
    case 'boolean':
      return 'boolean';
    case 'unknown':
      return 'desconhecido';
    case 'object':
      return 'object';
    case 'array':
      return `array<${describeType(type.element)}>`;
    case 'union':
      return describeVariants(type.variants);
  }
}

function describeVariants(variants: readonly InferredType[]): string {
  return variants.map(describeType).join(' | ');
}

function describeNameProblem(key: string): string | null {
  if (key.length === 0) {
    return 'está vazio';
  }
  if (/^\d/.test(key)) {
    return 'começa com um dígito';
  }
  if (/\s/.test(key)) {
    return 'contém espaços';
  }
  if (!isSimpleIdentifier(key) && /[^\x00-\x7F]/.test(key)) {
    return 'contém caracteres acentuados ou especiais';
  }
  if (!isSimpleIdentifier(key)) {
    return 'contém caracteres inválidos para identificadores';
  }
  if (JAVA_RESERVED_WORDS.has(key)) {
    return 'é uma palavra reservada em Java';
  }
  return null;
}

/** Infers the language independent schema of a parsed JSON document. */
export function inferSchema(root: JsonNode): SchemaAnalysis {
  return new SchemaInferrer().analyze(root);
}
