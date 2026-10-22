import { crc32, createZip } from './zip';

interface ReadEntry {
  name: string;
  content: string;
  crc: number;
}

/** Reads a stored (uncompressed) ZIP through its central directory. */
function readZip(data: Uint8Array): ReadEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const endOffset = data.length - 22;
  expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
  const count = view.getUint16(endOffset + 10, true);
  let pointer = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries: ReadEntry[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(pointer, true)).toBe(0x02014b50);
    const crc = view.getUint32(pointer + 16, true);
    const size = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(data.subarray(pointer + 46, pointer + 46 + nameLength));
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const start = localOffset + 30 + localNameLength;
    const content = decoder.decode(data.subarray(start, start + size));
    entries.push({ name, content, crc });
    pointer += 46 + nameLength;
  }
  return entries;
}

describe('createZip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('stores files with paths, UTF-8 content and checksums', () => {
    const zip = createZip(
      [
        { path: 'java/com/example/Cliente.java', content: 'public class Cliente {}\n' },
        {
          path: 'typescript/cliente.model.ts',
          content: 'export interface Cliente { nome: "João" }',
        },
      ],
      new Date(2026, 9, 22, 10, 30, 0),
    );
    const entries = readZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual([
      'java/com/example/Cliente.java',
      'typescript/cliente.model.ts',
    ]);
    expect(entries[1].content).toContain('João');
    for (const entry of entries) {
      expect(entry.crc).toBe(crc32(new TextEncoder().encode(entry.content)));
    }
  });

  it('creates a valid empty archive', () => {
    expect(createZip([]).length).toBe(22);
  });
});
