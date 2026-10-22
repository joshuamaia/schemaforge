import { buildFileTree } from './file-tree';

describe('buildFileTree', () => {
  it('groups files into folders and collapses single-folder chains', () => {
    const tree = buildFileTree([
      'java/com/example/model/TelefoneDTO.java',
      'java/com/example/model/ClienteDTO.java',
      'typescript/cliente.model.ts',
    ]);
    expect(tree.map((node) => node.name)).toEqual(['java/com/example/model', 'typescript']);
    expect(tree[0].path).toBe('java/com/example/model');
    expect(tree[0].children.map((node) => node.name)).toEqual([
      'ClienteDTO.java',
      'TelefoneDTO.java',
    ]);
    expect(tree[1].children[0]).toMatchObject({
      kind: 'file',
      path: 'typescript/cliente.model.ts',
    });
  });

  it('lists root files after folders', () => {
    const tree = buildFileTree(['b.ts', 'dir/a.ts']);
    expect(tree.map((node) => [node.kind, node.name])).toEqual([
      ['folder', 'dir'],
      ['file', 'b.ts'],
    ]);
  });
});
