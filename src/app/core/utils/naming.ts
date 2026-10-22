/** Naming helpers shared by inference, resolution and the code generators. */

export const JAVA_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'try',
  'void',
  'volatile',
  'while',
  'true',
  'false',
  'null',
  'var',
  'yield',
  'record',
  'sealed',
  'permits',
  'non-sealed',
  '_',
]);

/** Method names that a record component may not use, because they clash with `Object`. */
export const JAVA_RECORD_FORBIDDEN_COMPONENTS: ReadonlySet<string> = new Set([
  'clone',
  'finalize',
  'getClass',
  'hashCode',
  'notify',
  'notifyAll',
  'toString',
  'wait',
]);

/** Java types that cannot be used as class names without shadowing `java.lang`. */
export const JAVA_LANG_TYPES: ReadonlySet<string> = new Set([
  'Object',
  'String',
  'Integer',
  'Long',
  'Double',
  'Float',
  'Short',
  'Byte',
  'Boolean',
  'Character',
  'Number',
  'Class',
  'Record',
  'Enum',
  'Void',
  'System',
  'Math',
  'Thread',
  'Exception',
  'Error',
  'Iterable',
  'Override',
  'Deprecated',
  'Runnable',
  'Comparable',
  'Process',
  'Runtime',
  'StringBuilder',
  'Throwable',
]);

export const TS_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'implements',
  'interface',
  'let',
  'package',
  'private',
  'protected',
  'public',
  'static',
  'yield',
  'any',
  'boolean',
  'number',
  'string',
  'symbol',
  'unknown',
  'never',
  'object',
  'undefined',
  'type',
]);

/** TypeScript global type names that generated interfaces must not shadow. */
export const TS_GLOBAL_TYPES: ReadonlySet<string> = new Set([
  'Array',
  'Boolean',
  'Date',
  'Error',
  'Function',
  'Map',
  'Number',
  'Object',
  'Promise',
  'Record',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
  'Event',
  'Node',
  'Element',
  'Document',
  'Window',
  'Response',
  'Request',
  'Headers',
  'File',
  'Blob',
  'URL',
  'Iterator',
  'JSON',
  'Math',
]);

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isSimpleIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Splits any naming style (camel, snake, kebab, spaced) into lower-case words. */
export function splitWords(value: string): string[] {
  return stripAccents(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export function toPascalCase(value: string): string {
  return splitWords(value).map(capitalize).join('');
}

export function toCamelCase(value: string): string {
  const words = splitWords(value);
  return words.map((word, index) => (index === 0 ? word : capitalize(word))).join('');
}

export function toSnakeCase(value: string): string {
  return splitWords(value).join('_');
}

export function toKebabCase(value: string): string {
  return splitWords(value).join('-');
}

/** Keeps the original spelling but replaces characters that are invalid in identifiers. */
export function toSafeOriginal(value: string): string {
  return (
    stripAccents(value)
      .replace(/[^A-Za-z0-9_$]+/g, '_')
      .replace(/^_+|_+$/g, '') || ''
  );
}

const SINGULAR_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ões$/i, 'ão'],
  [/ães$/i, 'ão'],
  [/ãos$/i, 'ão'],
  [/éis$/i, 'el'],
  [/ais$/i, 'al'],
  [/(\w{2})ies$/i, '$1y'],
  [/(ss|sh|ch|x|z)es$/i, '$1'],
  [/([rs])es$/i, '$1'],
  [/ns$/i, 'm'],
  [/([^su])s$/i, '$1'],
];

/** Best-effort singularization of the last word (Portuguese and English rules). */
export function singularize(value: string): string {
  const match = /^(.*?)([A-Za-zÀ-ÿ]+)$/.exec(value);
  if (!match) {
    return value;
  }
  const [, prefix, lastWord] = match;
  const camelSplit = /^(.*[a-zà-ÿ0-9])([A-Z][a-zà-ÿ]+)$/.exec(lastWord);
  const head = camelSplit ? camelSplit[1] : '';
  const word = camelSplit ? camelSplit[2] : lastWord;
  if (word.length <= 3) {
    return value;
  }
  for (const [pattern, replacement] of SINGULAR_RULES) {
    if (pattern.test(word)) {
      const singular = word.replace(pattern, replacement);
      const fixed =
        word === word.toUpperCase() && word !== word.toLowerCase()
          ? singular.toUpperCase()
          : singular;
      return prefix + head + fixed;
    }
  }
  return value;
}

/** Ensures `base` is not in `used` (case-insensitively), adding a numeric suffix when needed. */
export function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}${counter++}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
