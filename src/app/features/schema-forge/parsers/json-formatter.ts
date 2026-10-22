import { JsonNode } from './json-ast';
import { parseJson } from './json-parser';

/**
 * Pretty prints a parsed document. String and number literals are copied from the source
 * text so escapes, big integers and decimals such as `10.0` are preserved exactly.
 */
export function formatJsonNode(root: JsonNode, source: string, indent = 2): string {
  const unit = ' '.repeat(indent);
  const out: string[] = [];

  const write = (node: JsonNode, level: number): void => {
    switch (node.type) {
      case 'object': {
        if (node.properties.length === 0) {
          out.push('{}');
          return;
        }
        const inner = unit.repeat(level + 1);
        out.push('{\n');
        node.properties.forEach((property, index) => {
          out.push(inner, source.slice(property.keyRange.start, property.keyRange.end), ': ');
          write(property.value, level + 1);
          out.push(index < node.properties.length - 1 ? ',\n' : '\n');
        });
        out.push(unit.repeat(level), '}');
        return;
      }
      case 'array': {
        if (node.items.length === 0) {
          out.push('[]');
          return;
        }
        const inner = unit.repeat(level + 1);
        out.push('[\n');
        node.items.forEach((item, index) => {
          out.push(inner);
          write(item, level + 1);
          out.push(index < node.items.length - 1 ? ',\n' : '\n');
        });
        out.push(unit.repeat(level), ']');
        return;
      }
      default:
        out.push(source.slice(node.range.start, node.range.end));
    }
  };

  write(root, 0);
  return out.join('') + '\n';
}

/** Formats JSON text, returning `null` when the text is not valid JSON. */
export function formatJsonText(text: string, indent = 2): string | null {
  const result = parseJson(text);
  return result.ok ? formatJsonNode(result.root, text, indent) : null;
}
